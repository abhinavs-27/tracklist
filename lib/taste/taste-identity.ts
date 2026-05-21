import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAllTimeAgg, getTotalPlayCount, getWeeklyAgg, currentWeekStart } from "@/lib/analytics/from-aggregates";
import { getArtists } from "@/lib/spotify";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  upsertArtistFromSpotify,
} from "@/lib/spotify-cache";
import { scheduleEnrichArtistGenresForArtistIds } from "./enrich-artist-genres";
import { ratingsToArtistCountMap } from "./ratings-weight";
import { computeTasteAxes } from "./compute-taste-axes";
import {
  normalizeListeningStyle,
  type TasteListeningStyle,
} from "./listening-style";
import type {
  TasteMatchEntryAlbum,
  TasteMatchEntryTrack,
} from "@/types";
import type {
  TasteGenre,
  TasteIdentity,
  TasteRecentSnapshot,
  TasteTopAlbum,
  TasteTopArtist,
} from "./types";

export type {
  TasteGenre,
  TasteIdentity,
  TasteRecentSnapshot,
  TasteTopAlbum,
  TasteTopArtist,
} from "./types";
export type { TasteListeningStyle } from "./listening-style";

const TOP_N = 10;
const TOP_GENRES = 10;
const LOG_CAP = 8000;
const SESSION_GAP_MS = 30 * 60 * 1000;
/** PostgREST `.in(uuid…)` expands the request URL; ~400 UUIDs (~15k+ chars) trips undici/header limits. */
const TRACK_IDS_POSTGREST_CHUNK = 100;

const EMPTY: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "still-forming",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "Log more listens to build your taste profile.",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Cached payloads may still have legacy diversity 0–100; UI is 0–10 distinct genres. */
function normalizeDiversityScore(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n <= 10) return Math.min(10, Math.round(n));
  return Math.min(10, Math.round(n / 10));
}

function maxLogsPerDay(
  logs: { listened_at: string }[],
): number {
  const byDay = new Map<string, number>();
  for (const l of logs) {
    const d = new Date(l.listened_at).toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  let m = 0;
  for (const v of byDay.values()) m = Math.max(m, v);
  return m;
}

function buildSummary(t: TasteIdentity): string {
  if (t.totalLogs === 0) return EMPTY.summary;
  const bits: string[] = [];
  // diversityScore is 0–10 (distinct genre tags, capped at 10).
  if (t.diversityScore >= 7) {
    bits.push("You explore a wide spread of genres.");
  } else if (t.diversityScore <= 3) {
    bits.push("Your listening clusters in a focused set of genres.");
  }
  if (t.obscurityScore != null && t.obscurityScore >= 55) {
    bits.push("You lean toward deeper or less mainstream catalog.");
  } else if (t.obscurityScore != null && t.obscurityScore <= 35) {
    bits.push("You gravitate toward popular tracks.");
  }
  const ls = normalizeListeningStyle(t.listeningStyle as string);
  switch (ls) {
    case "the-devotee":
      bits.push("You circle back to the same albums a lot.");
      break;
    case "genre-nomad":
      bits.push("You jump between a lot of different artists.");
      break;
    case "the-loyalist":
      bits.push("Your plays keep circling back to the same few artists.");
      break;
    case "daily-ritual":
      bits.push("You listen steadily without wild swings or huge binges.");
      break;
    case "cultural-pulse":
      bits.push("A lot of your plays sit on the popular side.");
      break;
    case "the-archivist":
      bits.push("You lean toward tracks that aren’t the obvious singles.");
      break;
    case "session-maximalist":
      bits.push("Sometimes you rack up a ton of plays in one go.");
      break;
    case "still-forming":
      bits.push("Not enough logged listens yet to say much.");
      break;
    default:
      bits.push("Your habits mix a few different patterns.");
  }
  return bits.join(" ");
}

/** Stale cache / raw Spotify id / placeholder title — prefer catalog or Spotify. */
function needsAlbumNameFallback(name: string, id: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (n === id) return true;
  if (n === "Unknown album") return true;
  if (n.length >= 16 && /^[0-9A-Za-z]+$/.test(n)) return true;
  return false;
}

function tasteTopAlbumNeedsCatalogEnrichment(al: TasteTopAlbum): boolean {
  if (needsAlbumNameFallback(al.name, al.id)) return true;
  if (!String(al.imageUrl ?? "").trim()) return true;
  return false;
}

function normalizeCachedTasteIdentity(cached: TasteIdentity): TasteIdentity {
  const listeningStyle = normalizeListeningStyle(String(cached.listeningStyle));
  const diversityScore = normalizeDiversityScore(cached.diversityScore);
  const base = { ...cached, listeningStyle, diversityScore };
  if (base.totalLogs === 0) {
    const ratingCount = base.topAlbums.length;
    const coldSummary = ratingCount > 0
      ? `Rated ${ratingCount} album${ratingCount === 1 ? "" : "s"} · taste profile built from your ratings`
      : EMPTY.summary;
    return { ...base, summary: coldSummary, recent: undefined };
  }
  return { ...base, summary: buildSummary(base) };
}

/**
 * Overlay latest `artists` / `albums` image URLs from the DB.
 * Cached taste JSON can lag behind rows updated by `getOrFetchArtist` and other paths.
 */
async function hydrateTasteIdentityArtwork(
  admin: SupabaseClient,
  identity: TasteIdentity,
): Promise<TasteIdentity> {
  if (identity.topArtists.length === 0 && identity.topAlbums.length === 0) {
    return identity;
  }

  const artistIds = [...new Set(identity.topArtists.map((a) => a.id).filter(Boolean))];
  const albumIds = [...new Set(identity.topAlbums.map((a) => a.id).filter(Boolean))];
  const artistImage = new Map<string, string | null>();
  const albumImage = new Map<string, string | null>();
  const CHUNK = 300;

  for (let i = 0; i < artistIds.length; i += CHUNK) {
    const chunk = artistIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("artists")
      .select("id, image_url")
      .in("id", chunk);
    if (error) {
      console.warn("[taste-identity] hydrate artists failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; image_url: string | null };
      artistImage.set(r.id, r.image_url);
    }
  }

  for (let i = 0; i < albumIds.length; i += CHUNK) {
    const chunk = albumIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("albums")
      .select("id, image_url")
      .in("id", chunk);
    if (error) {
      console.warn("[taste-identity] hydrate albums failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; image_url: string | null };
      albumImage.set(r.id, r.image_url);
    }
  }

  return {
    ...identity,
    topArtists: identity.topArtists.map((a) => {
      if (!artistImage.has(a.id)) return a;
      const url = artistImage.get(a.id);
      return { ...a, imageUrl: url ?? a.imageUrl ?? null };
    }),
    topAlbums: identity.topAlbums.map((al) => {
      if (!albumImage.has(al.id)) return al;
      const url = albumImage.get(al.id);
      return { ...al, imageUrl: url ?? al.imageUrl ?? null };
    }),
  };
}

/**
 * Cached taste can still say "Unknown album" after `albums` rows were filled by
 * `/album/[id]` or Spotify sync. Refresh names from DB, then Spotify if needed.
 */
async function hydrateTasteIdentityNamesFromCatalog(
  admin: SupabaseClient,
  identity: TasteIdentity,
): Promise<TasteIdentity> {
  if (identity.topAlbums.length === 0) return identity;

  const ids = [...new Set(identity.topAlbums.map((a) => a.id).filter(Boolean))];
  const CHUNK = 300;
  const albumRows = new Map<
    string,
    { name: string | null; artist_id: string | null }
  >();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("albums")
      .select("id, name, artist_id")
      .in("id", chunk);
    if (error) {
      console.warn("[taste-identity] hydrate album names failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        name: string | null;
        artist_id: string | null;
      };
      albumRows.set(r.id, { name: r.name, artist_id: r.artist_id });
    }
  }

  const artistIds = new Set<string>();
  for (const id of ids) {
    const row = albumRows.get(id);
    if (row?.artist_id?.trim()) artistIds.add(row.artist_id.trim());
  }

  const artistNames = new Map<string, string>();
  const artistIdList = [...artistIds];
  for (let i = 0; i < artistIdList.length; i += CHUNK) {
    const chunk = artistIdList.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("artists")
      .select("id, name")
      .in("id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const r = row as { id: string; name: string | null };
      if (r.name?.trim()) artistNames.set(r.id, r.name.trim());
    }
  }

  let topAlbums = identity.topAlbums.map((al) => {
    const row = albumRows.get(al.id);
    let name = al.name;
    let artistName = al.artistName;
    if (row?.name?.trim() && needsAlbumNameFallback(al.name, al.id)) {
      name = row.name.trim();
    }
    const aid = row?.artist_id?.trim();
    if (aid && (artistName === "Unknown" || !artistName.trim())) {
      const n = artistNames.get(aid);
      if (n) artistName = n;
    }
    if (name === al.name && artistName === al.artistName) return al;
    return { ...al, name, artistName };
  });

  let needAlbumIds = [
    ...new Set(
      topAlbums.filter(tasteTopAlbumNeedsCatalogEnrichment).map((a) => a.id),
    ),
  ];

  if (needAlbumIds.length > 0) {
    const mergeAlbumFromSpotify = (
      al: TasteTopAlbum,
      sa: Awaited<ReturnType<typeof getOrFetchAlbumsBatch>>[number],
    ): TasteTopAlbum => {
      if (!sa?.name?.trim()) return al;
      const artistN = sa.artists?.[0]?.name?.trim();
      return {
        ...al,
        name: sa.name.trim(),
        artistName: artistN ?? al.artistName,
        imageUrl: al.imageUrl ?? sa.images?.[0]?.url ?? null,
      };
    };

    const pass1 = await getOrFetchAlbumsBatch(needAlbumIds, {
      allowNetwork: false,
    });
    const byId1 = new Map(
      needAlbumIds.map((id, i) => [id, pass1[i] ?? null] as const),
    );
    const needSet1 = new Set(needAlbumIds);
    topAlbums = topAlbums.map((al) =>
      needSet1.has(al.id)
        ? mergeAlbumFromSpotify(al, byId1.get(al.id) ?? null)
        : al,
    );

    needAlbumIds = [
      ...new Set(
        topAlbums.filter(tasteTopAlbumNeedsCatalogEnrichment).map((a) => a.id),
      ),
    ];
    if (needAlbumIds.length > 0) {
      const pass2 = await getOrFetchAlbumsBatch(needAlbumIds, {
        allowNetwork: true,
      });
      const byId2 = new Map(
        needAlbumIds.map((id, i) => [id, pass2[i] ?? null] as const),
      );
      const needSet2 = new Set(needAlbumIds);
      topAlbums = topAlbums.map((al) =>
        needSet2.has(al.id)
          ? mergeAlbumFromSpotify(al, byId2.get(al.id) ?? null)
          : al,
      );
    }

    const artistIdsMissing = [
      ...new Set(
        topAlbums
          .filter((a) => a.artistName === "Unknown" || !a.artistName.trim())
          .map((a) => albumRows.get(a.id)?.artist_id?.trim())
          .filter((x): x is string => Boolean(x)),
      ),
    ].filter((id) => !artistNames.has(id));
    if (artistIdsMissing.length > 0) {
      const extra = await fetchArtistsBatch(admin, artistIdsMissing);
      for (const [id, m] of extra) {
        if (m.name?.trim()) artistNames.set(id, m.name.trim());
      }
      topAlbums = topAlbums.map((al) => {
        if (al.artistName !== "Unknown" && al.artistName.trim()) return al;
        const aid = albumRows.get(al.id)?.artist_id?.trim();
        if (!aid) return al;
        const n = artistNames.get(aid);
        return n ? { ...al, artistName: n } : al;
      });
    }
  }

  return { ...identity, topAlbums };
}

async function fetchSongsBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<
  Map<
    string,
    {
      album_id: string;
      artist_id: string;
      popularity: number | null;
    }
  >
> {
  const out = new Map<
    string,
    { album_id: string; artist_id: string; popularity: number | null }
  >();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += TRACK_IDS_POSTGREST_CHUNK) {
    const chunk = unique.slice(i, i + TRACK_IDS_POSTGREST_CHUNK);
    const { data, error } = await admin
      .from("tracks")
      .select("id, album_id, artist_id, popularity")
      .in("id", chunk);
    if (error) {
      console.error("[taste-identity] songs batch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        album_id: string;
        artist_id: string;
        popularity: number | null;
      };
      out.set(r.id, {
        album_id: r.album_id,
        artist_id: r.artist_id,
        popularity: r.popularity,
      });
    }
  }
  return out;
}

async function fetchSongTitlesBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<
  Map<
    string,
    { name: string; album_id: string | null; artist_id: string | null }
  >
> {
  const out = new Map<
    string,
    { name: string; album_id: string | null; artist_id: string | null }
  >();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += TRACK_IDS_POSTGREST_CHUNK) {
    const chunk = unique.slice(i, i + TRACK_IDS_POSTGREST_CHUNK);
    const { data, error } = await admin
      .from("tracks")
      .select("id, name, album_id, artist_id")
      .in("id", chunk);
    if (error) {
      console.error("[taste-identity] song titles batch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        name: string;
        album_id: string | null;
        artist_id: string | null;
      };
      out.set(r.id, {
        name: r.name,
        album_id: r.album_id,
        artist_id: r.artist_id,
      });
    }
  }
  return out;
}

function maxCountEntry<K extends string>(
  counts: Map<K, number>,
): [K, number] | null {
  let best: [K, number] | null = null;
  for (const [k, v] of counts) {
    if (!best || v > best[1] || (v === best[1] && k < best[0])) {
      best = [k, v];
    }
  }
  return best;
}

async function fetchArtistsBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<
  Map<
    string,
    { name: string; genres: string[] | null; image_url: string | null; popularity: number | null }
  >
> {
  const out = new Map<
    string,
    {
      name: string;
      genres: string[] | null;
      image_url: string | null;
      popularity: number | null;
    }
  >();
  const unique = [...new Set(ids)].filter(Boolean);
  const CHUNK = 300;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("artists")
      .select("id, name, genres, image_url, popularity")
      .in("id", chunk);
    if (error) {
      console.error("[taste-identity] artists batch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        name: string;
        genres: string[] | null;
        image_url: string | null;
        popularity: number | null;
      };
      out.set(r.id, {
        name: r.name,
        genres: r.genres,
        image_url: r.image_url,
        popularity: r.popularity,
      });
    }
  }
  return out;
}

type LogRowSlice = {
  track_id: string;
  album_id: string | null;
  artist_id: string | null;
};

function genreWeightsFromArtistCounts(
  artistCounts: Map<string, number>,
  artistMeta: Map<
    string,
    { name: string; genres: string[] | null; image_url: string | null; popularity: number | null }
  >,
): TasteGenre[] {
  const genreRaw = new Map<string, number>();
  const genreLabel = new Map<string, string>();
  for (const [artistId, listenCount] of artistCounts) {
    const meta = artistMeta.get(artistId);
    const genres = meta?.genres?.map((g) => g.trim()).filter(Boolean) ?? [];
    if (genres.length === 0) continue;
    const per = listenCount / genres.length;
    for (const g of genres) {
      const key = g.toLowerCase();
      if (!genreLabel.has(key)) genreLabel.set(key, g);
      genreRaw.set(key, (genreRaw.get(key) ?? 0) + per);
    }
  }
  const genreTotal = [...genreRaw.values()].reduce((a, b) => a + b, 0);
  if (genreTotal <= 0) return [];
  return [...genreRaw.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES)
    .map(([key, c]) => ({
      name: genreLabel.get(key) ?? key,
      weight: Math.round((c / genreTotal) * 1000) / 10,
    }));
}

async function aggregateLogsToTopGenres(
  admin: SupabaseClient,
  logs: LogRowSlice[],
): Promise<TasteGenre[]> {
  if (logs.length === 0) return [];
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))];
  const songMap = await fetchSongsBatch(admin, trackIds);
  const artistCounts = new Map<string, number>();
  for (const log of logs) {
    const song = songMap.get(log.track_id);
    const artistId = log.artist_id ?? song?.artist_id ?? null;
    if (artistId) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
    }
  }
  if (artistCounts.size === 0) return [];
  const artistMeta = await fetchArtistsBatch(admin, [...artistCounts.keys()]);
  return genreWeightsFromArtistCounts(artistCounts, artistMeta);
}

function buildRecentInsightSentence(
  genres7: TasteGenre[],
  genres30: TasteGenre[],
  logCount7: number,
  logCount30: number,
): string {
  if (logCount30 < 5) {
    return "Log a few more plays across the last month to unlock week-over-week taste insights.";
  }
  if (logCount7 < 3) {
    return "Add a few more listens this week and we’ll highlight how your taste shifted.";
  }
  const top7 = genres7[0];
  const top30 = genres30[0];
  if (top7 && top30 && top7.name !== top30.name) {
    return `This week you’re leaning more into ${top7.name} than your ${logCount30}-day usual (${top30.name}).`;
  }
  const sameName = top7?.name;
  const share30 = genres30.find((g) => g.name === sameName)?.weight ?? 0;
  if (top7 && sameName && top7.weight >= share30 + 12) {
    return `You’re doubling down on ${sameName} this week — a bigger slice of your plays than usual.`;
  }
  if (top7) {
    return `Your ${logCount7} plays this week keep ${top7.name} center stage — in line with your ${logCount30}-day mix.`;
  }
  return "Your listening mix this week matches your recent breadth — keep logging to refine trends.";
}

async function computeRecentTasteSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<TasteRecentSnapshot | null> {
  const curWeek = currentWeekStart();

  // Four-week window start: Monday 4 weeks before current week
  const fourWeeksAgoDate = new Date(curWeek);
  fourWeeksAgoDate.setUTCDate(fourWeeksAgoDate.getUTCDate() - 28);
  const fourWeeksAgo = fourWeeksAgoDate.toISOString().slice(0, 10);

  // Parallel: current-week genre/track aggregates + last-4-weeks genre/track aggregates
  const [curGenres, curTrackCount, allGenreData, allTrackData] = await Promise.all([
    getWeeklyAgg(admin, userId, "genre", curWeek, 50),
    getWeeklyAgg(admin, userId, "track", curWeek, 1000).then((rows) =>
      rows.reduce((s, r) => s + r.count, 0),
    ),
    admin
      .from("user_listening_aggregates")
      .select("entity_id, count")
      .eq("user_id", userId)
      .eq("entity_type", "genre")
      .gte("week_start", fourWeeksAgo)
      .not("week_start", "is", null),
    admin
      .from("user_listening_aggregates")
      .select("count")
      .eq("user_id", userId)
      .eq("entity_type", "track")
      .gte("week_start", fourWeeksAgo)
      .not("week_start", "is", null),
  ]);

  const logCount7d  = curTrackCount;
  const logCount30d = (allTrackData.data ?? []).reduce(
    (s, r) => s + (r as { count: number }).count,
    0,
  );

  if (logCount30d === 0) return null;

  // Sum genre counts across all weeks in the 4-week window
  const genreSums = new Map<string, number>();
  for (const r of allGenreData.data ?? []) {
    const row = r as { entity_id: string; count: number };
    genreSums.set(row.entity_id, (genreSums.get(row.entity_id) ?? 0) + row.count);
  }
  const allGenres = [...genreSums.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([entity_id, count]) => ({ entity_id, count }));

  const toTasteGenres = (rows: { entity_id: string; count: number }[]): TasteGenre[] => {
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total === 0) return [];
    return rows.slice(0, TOP_GENRES).map((r) => ({
      name:   r.entity_id,
      weight: Math.round((r.count / total) * 1000) / 10,
    }));
  };

  const topGenres7d  = toTasteGenres(curGenres);
  const topGenres30d = toTasteGenres(allGenres);

  const insightWeek = buildRecentInsightSentence(
    topGenres7d,
    topGenres30d,
    logCount7d,
    logCount30d,
  );

  return {
    logCount7d,
    logCount30d,
    topGenres7d,
    topGenres30d,
    insightWeek,
  };
}

/**
 * One log scan: top artists for overlap + their heaviest album/track for Taste Match “Start here”.
 */
export async function aggregateLogsForTasteMatch(
  admin: SupabaseClient,
  userId: string,
  artistLimit: number,
): Promise<{
  topArtists: TasteTopArtist[];
  topAlbum: TasteMatchEntryAlbum | null;
  topTrack: TasteMatchEntryTrack | null;
}> {
  const none = (): {
    topArtists: TasteTopArtist[];
    topAlbum: TasteMatchEntryAlbum | null;
    topTrack: TasteMatchEntryTrack | null;
  } => ({ topArtists: [], topAlbum: null, topTrack: null });

  const cap = Math.min(Math.max(1, artistLimit), 50);

  // Pull all-time counts from aggregates — no log cap, no track-resolution joins.
  const [artistAgg, albumAgg, trackAgg] = await Promise.all([
    getAllTimeAgg(admin, userId, "artist", cap + 10),
    getAllTimeAgg(admin, userId, "album", 10),
    getAllTimeAgg(admin, userId, "track", 10),
  ]);

  if (artistAgg.length === 0) return none();

  const artistCounts = new Map(artistAgg.map((r) => [r.entity_id, r.count]));
  const albumCounts = new Map(albumAgg.map((r) => [r.entity_id, r.count]));
  const trackCounts = new Map(trackAgg.map((r) => [r.entity_id, r.count]));

  const topIds = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([id]) => id);

  const artistMeta = await fetchArtistsBatch(admin, topIds);
  const topArtists: TasteTopArtist[] = topIds.map((id) => {
    const m = artistMeta.get(id);
    return {
      id,
      name: m?.name ?? "Unknown",
      listenCount: artistCounts.get(id) ?? 0,
      imageUrl: m?.image_url ?? null,
    };
  });

  let topAlbum: TasteMatchEntryAlbum | null = null;
  const albumBest = maxCountEntry(albumCounts);
  if (albumBest) {
    const [albumId, playCount] = albumBest;
    const albumMap = await fetchAlbumsBatch(admin, [albumId]);
    const al = albumMap.get(albumId);
    if (al) {
      const am = await fetchArtistsBatch(admin, [al.artist_id]);
      topAlbum = {
        id: albumId,
        name: al.name,
        artistName: am.get(al.artist_id)?.name ?? "Unknown",
        imageUrl: al.image_url,
        playCount,
      };
    }
  }

  let topTrack: TasteMatchEntryTrack | null = null;
  const trackBest = maxCountEntry(trackCounts);
  if (trackBest) {
    const [trId, playCount] = trackBest;
    const sm = await fetchSongTitlesBatch(admin, [trId]);
    const s = sm.get(trId);
    if (s) {
      const albumIds = s.album_id ? [s.album_id] : [];
      const artistIds = s.artist_id ? [s.artist_id] : [];
      const [albumMap2, artistMap2] = await Promise.all([
        albumIds.length ? fetchAlbumsBatch(admin, albumIds) : Promise.resolve(new Map()),
        artistIds.length ? fetchArtistsBatch(admin, artistIds) : Promise.resolve(new Map()),
      ]);
      const albumName = s.album_id
        ? albumMap2.get(s.album_id)?.name ?? null
        : null;
      const artistName = s.artist_id
        ? artistMap2.get(s.artist_id)?.name ?? null
        : null;
      topTrack = {
        id: trId,
        name: s.name,
        albumId: s.album_id,
        albumName,
        artistName,
        playCount,
      };
    }
  }

  return { topArtists, topAlbum, topTrack };
}

/**
 * Top artists by play count from logs (not taste-identity cache). Taste match uses
 * this so overlap compares a larger pool (e.g. top 20) than cached identity (top 10),
 * and avoids stale/empty cache making shared artists look like zero.
 */
export async function getTopArtistsFromLogsForMatch(
  admin: SupabaseClient,
  userId: string,
  limit: number,
): Promise<TasteTopArtist[]> {
  const r = await aggregateLogsForTasteMatch(admin, userId, limit);
  return r.topArtists;
}

async function fetchAlbumsBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<
  Map<
    string,
    { name: string; artist_id: string; image_url: string | null }
  >
> {
  const out = new Map<
    string,
    { name: string; artist_id: string; image_url: string | null }
  >();
  const unique = [...new Set(ids)].filter(Boolean);
  const CHUNK = 300;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("albums")
      .select("id, name, artist_id, image_url")
      .in("id", chunk);
    if (error) {
      console.error("[taste-identity] albums batch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      };
      out.set(r.id, {
        name: r.name,
        artist_id: r.artist_id,
        image_url: r.image_url,
      });
    }
  }
  return out;
}

/** Fetches all album reviews (rating ≥ 3) for a user, resolved to artistId. */
async function fetchUserAlbumRatings(
  admin: SupabaseClient,
  userId: string,
): Promise<import("./ratings-weight").RatingEntry[]> {
  const { data, error } = await admin
    .from("reviews")
    .select("entity_id, rating")
    .eq("user_id", userId)
    .eq("entity_type", "album")
    .gte("rating", 3);

  if (error || !data?.length) return [];

  const albumIds = data.map((r) => (r as { entity_id: string; rating: number }).entity_id);
  const albumMeta = await fetchAlbumsBatch(admin, albumIds);

  return data.map((r) => {
    const row = r as { entity_id: string; rating: number };
    const album = albumMeta.get(row.entity_id);
    return {
      albumId: row.entity_id,
      artistId: album?.artist_id ?? "",
      rating: row.rating,
    };
  });
}

async function enrichTopArtistsFromSpotify(
  admin: SupabaseClient,
  artistIdsMissingImage: string[],
): Promise<void> {
  if (artistIdsMissingImage.length === 0) return;
  try {
    const artists = await getArtists(artistIdsMissingImage, {
      allowClientCredentials: true,
    });
    for (const a of artists) {
      await upsertArtistFromSpotify(admin, a);
    }
  } catch (e) {
    console.warn("[taste-identity] Spotify enrich for artist images failed", e);
  }
}

export async function computeTasteIdentity(
  admin: SupabaseClient,
  userId: string,
): Promise<TasteIdentity> {
  // --- Counts from aggregates (no log cap, accurate even for 100k+ log users) ---
  const [artistAgg, albumAgg, totalLogs] = await Promise.all([
    getAllTimeAgg(admin, userId, "artist", 200),
    getAllTimeAgg(admin, userId, "album", 200),
    getTotalPlayCount(admin, userId),
  ]);

  const ratingEntries = await fetchUserAlbumRatings(admin, userId);
  const ratingArtistCounts = ratingsToArtistCountMap(ratingEntries);

  if (totalLogs === 0 && artistAgg.length === 0 && ratingArtistCounts.size === 0) {
    return { ...EMPTY };
  }

  const artistCounts = new Map(artistAgg.map((r) => [r.entity_id, r.count]));
  // Merge ratings-derived synthetic weights into log-derived counts.
  // For zero-log users, ratings carry the full signal.
  // For active listeners, the small synthetic weights (max 15/album) are a minor nudge.
  for (const [artistId, syntheticCount] of ratingArtistCounts) {
    artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + syntheticCount);
  }
  const albumCounts = new Map(albumAgg.map((r) => [r.entity_id, r.count]));
  const artistIdsForMeta = new Set(artistCounts.keys());

  // --- Small log scan — only needed for popularity scores and session timing ---
  // Track IDs for popularity; listened_at timestamps for session gap detection.
  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: true })
    .limit(2000);

  if (logErr) {
    console.warn("[taste-identity] session/popularity log scan failed", logErr);
  }

  const logs = (logRows ?? []) as { track_id: string; listened_at: string }[];

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))];
  const songMap = trackIds.length ? await fetchSongsBatch(admin, trackIds) : new Map();

  const popularities: number[] = [];
  for (const log of logs) {
    const pop = songMap.get(log.track_id)?.popularity;
    if (typeof pop === "number" && !Number.isNaN(pop)) {
      popularities.push(pop);
    }
  }

  let artistMeta = await fetchArtistsBatch(admin, [...artistIdsForMeta]);

  const genreRaw = new Map<string, number>();
  const genreLabel = new Map<string, string>();

  // `artists.genres` — filled from Last.fm tags via `enrichArtistGenres` (Spotify artist genres are unreliable).
  for (const [artistId, listenCount] of artistCounts) {
    const meta = artistMeta.get(artistId);
    const genres = meta?.genres?.map((g) => g.trim()).filter(Boolean) ?? [];
    if (genres.length === 0) continue;
    const per = listenCount / genres.length;
    for (const g of genres) {
      const key = g.toLowerCase();
      if (!genreLabel.has(key)) genreLabel.set(key, g);
      genreRaw.set(key, (genreRaw.get(key) ?? 0) + per);
    }
  }

  const genreTotal = [...genreRaw.values()].reduce((a, b) => a + b, 0);
  const topGenres: TasteGenre[] =
    genreTotal > 0
      ? [...genreRaw.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_GENRES)
          .map(([key, c]) => ({
            name: genreLabel.get(key) ?? key,
            weight: Math.round((c / genreTotal) * 1000) / 10,
          }))
      : [];

  const uniqueGenres = genreRaw.size;
  /** 0–10: count of distinct genre tags across listened artists, capped at 10 (matches UI). */
  const diversityScore =
    uniqueGenres === 0 ? 0 : Math.min(10, uniqueGenres);

  let obscurityScore: number | null = null;
  if (popularities.length > 0) {
    const avgPop =
      popularities.reduce((a, b) => a + b, 0) / popularities.length;
    obscurityScore = clamp(Math.round(100 - avgPop), 0, 100);
  }

  // Session detection uses the 2000-row sample. avgTracksPerSession must use
  // the same sample's play count — mixing the all-time total with a sampled
  // session count inflates the result by 10-100x for heavy users.
  const samplePlayCount = logs.length;
  const listenedTimes = logs.map((l) => new Date(l.listened_at).getTime());
  let sessions = 1;
  for (let i = 1; i < listenedTimes.length; i++) {
    if (listenedTimes[i]! - listenedTimes[i - 1]! > SESSION_GAP_MS) {
      sessions += 1;
    }
  }
  const avgTracksPerSession =
    sessions > 0 ? Math.round((samplePlayCount / sessions) * 10) / 10 : samplePlayCount;

  const styleResult = await computeTasteAxes(admin, userId, obscurityScore);

  const topArtistIds = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id]) => id);

  const missingImages = topArtistIds.filter((id) => {
    const m = artistMeta.get(id);
    return !m?.image_url;
  });
  if (missingImages.length > 0) {
    const sliceIds = missingImages.slice(0, 10);
    const offlineArtists = await getOrFetchArtistsBatch(sliceIds, {
      allowNetwork: false,
    });
    for (let i = 0; i < sliceIds.length; i++) {
      const a = offlineArtists[i];
      if (a) await upsertArtistFromSpotify(admin, a);
    }
    artistMeta = await fetchArtistsBatch(admin, [...artistIdsForMeta]);
    const stillMissingImage = sliceIds.filter((id) => {
      const m = artistMeta.get(id);
      return !m?.image_url;
    });
    if (stillMissingImage.length > 0) {
      await enrichTopArtistsFromSpotify(admin, stillMissingImage);
      artistMeta = await fetchArtistsBatch(admin, [...artistIdsForMeta]);
    }
  }

  scheduleEnrichArtistGenresForArtistIds(admin, topArtistIds, 14);

  const topArtists: TasteTopArtist[] = topArtistIds.map((id) => {
    const m = artistMeta.get(id);
    return {
      id,
      name: m?.name ?? "Unknown",
      listenCount: artistCounts.get(id) ?? 0,
      imageUrl: m?.image_url ?? null,
    };
  });

  const topAlbumIds = [...albumCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id]) => id);

  let albumMeta = await fetchAlbumsBatch(admin, topAlbumIds);
  const albumRowNeedsEnrichment = (id: string) => {
    const al = albumMeta.get(id);
    return (
      !al ||
      !String(al.name ?? "").trim() ||
      !String(al.image_url ?? "").trim()
    );
  };
  let idsNeedingAlbumFill = topAlbumIds.filter(albumRowNeedsEnrichment);
  const applySpotifyAlbumBatch = (
    ids: string[],
    spotifyAlbums: Awaited<ReturnType<typeof getOrFetchAlbumsBatch>>,
  ) => {
    const next = new Map(albumMeta);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const sa = spotifyAlbums[i];
      if (!sa?.name?.trim()) continue;
      const prev = next.get(id);
      const artistId =
        sa.artists?.[0]?.id?.trim() ?? prev?.artist_id?.trim() ?? "";
      next.set(id, {
        name: sa.name,
        artist_id: artistId || prev?.artist_id || "",
        image_url: prev?.image_url ?? sa.images?.[0]?.url ?? null,
      });
    }
    albumMeta = next;
  };
  if (idsNeedingAlbumFill.length > 0) {
    const spotifyAlbumsOffline = await getOrFetchAlbumsBatch(
      idsNeedingAlbumFill,
      { allowNetwork: false },
    );
    applySpotifyAlbumBatch(idsNeedingAlbumFill, spotifyAlbumsOffline);
    idsNeedingAlbumFill = topAlbumIds.filter(albumRowNeedsEnrichment);
    if (idsNeedingAlbumFill.length > 0) {
      const spotifyAlbumsOnline = await getOrFetchAlbumsBatch(
        idsNeedingAlbumFill,
        { allowNetwork: true },
      );
      applySpotifyAlbumBatch(idsNeedingAlbumFill, spotifyAlbumsOnline);
    }
  }

  const albumArtistIds = new Set<string>();
  for (const id of topAlbumIds) {
    const al = albumMeta.get(id);
    if (al?.artist_id) albumArtistIds.add(al.artist_id);
  }
  const missingArtists = [...albumArtistIds].filter((id) => !artistMeta.has(id));
  if (missingArtists.length > 0) {
    const extra = await fetchArtistsBatch(admin, missingArtists);
    artistMeta = new Map([...artistMeta, ...extra]);
  }

  const topAlbums: TasteTopAlbum[] = topAlbumIds.map((id) => {
    const al = albumMeta.get(id);
    const an = al?.name ?? "Unknown album";
    const artistName = al?.artist_id
      ? artistMeta.get(al.artist_id)?.name ?? "Unknown"
      : "Unknown";
    return {
      id,
      name: an,
      artistName,
      listenCount: albumCounts.get(id) ?? 0,
      imageUrl: al?.image_url ?? null,
    };
  });

  const base: TasteIdentity = {
    topArtists,
    topAlbums,
    topGenres,
    obscurityScore,
    diversityScore,
    listeningStyle: styleResult.primary,  // set from axis model result
    avgTracksPerSession,
    totalLogs,
    summary: "",
    styleResult,
  };
  const withSummary = { ...base, summary: buildSummary(base) };
  const recent = await computeRecentTasteSnapshot(admin, userId);
  return { ...withSummary, recent: recent ?? undefined };
}

async function upsertTasteIdentityCache(
  admin: SupabaseClient,
  userId: string,
  payload: TasteIdentity,
): Promise<void> {
  const { error } = await admin.from("taste_identity_cache").upsert(
    {
      user_id: userId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.warn("[taste-identity] cache upsert failed", error);
  }
}

/**
 * Recompute taste identity from logs and write `taste_identity_cache` (no stale check).
 * Used by the daily cron and can be called after bulk imports.
 */
/**
 * Recompute from logs, merge latest artwork from `artists` / `albums`, and upsert cache.
 * Call from the daily cron (or after bulk imports); profile reads do not run this.
 */
export async function refreshTasteIdentityCacheForUser(
  userId: string,
): Promise<TasteIdentity> {
  const admin = createSupabaseAdminClient();
  const computed = await computeTasteIdentity(admin, userId);
  const hydrated = await hydrateTasteIdentityArtwork(admin, computed);
  await upsertTasteIdentityCache(admin, userId, hydrated);
  return hydrated;
}

/**
 * Batch-inserts onboarding ratings to `reviews`, saves preferred_genres,
 * and seeds taste_identity_cache. Replaces seedTasteIdentityFromFavoriteAlbums.
 */
export async function seedTasteIdentityFromRatings(
  userId: string,
  ratings: Array<{ albumId: string; rating: number; reviewText?: string }>,
  preferredGenres: string[],
): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. Save preferred genres
  if (preferredGenres.length > 0) {
    await admin
      .from("users")
      .update({ preferred_genres: preferredGenres })
      .eq("id", userId);
  }

  // 2. Batch-insert reviews (upsert so re-running onboarding doesn't duplicate)
  const validRatings = ratings.filter((r) => r.albumId && r.rating >= 1 && r.rating <= 5);
  if (validRatings.length > 0) {
    const rows = validRatings.map((r) => ({
      user_id: userId,
      entity_type: "album" as const,
      entity_id: r.albumId,
      rating: r.rating,
      review_text: r.reviewText ?? null,
    }));
    await admin
      .from("reviews")
      .upsert(rows, { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: false });
  }

  // 3. Seed taste identity using full ratings (not capped 4-album seed)
  await refreshTasteIdentityCacheForUser(userId);
}

/**
 * Cold-start `taste_identity_cache` from onboarding favorite albums (no logs yet).
 * Replaced on first real `refreshTasteIdentityCacheForUser` / cron when logs exist.
 */
export async function seedTasteIdentityFromFavoriteAlbums(
  userId: string,
  albumIds: string[],
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const ids = [...new Set(albumIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    4,
  );
  if (ids.length === 0) return;

  await getOrFetchAlbumsBatch(ids, { allowNetwork: false });
  let albumMeta = await fetchAlbumsBatch(admin, ids);
  const albumIdsNeedingNetwork = ids.filter((id) => {
    const al = albumMeta.get(id);
    return (
      !al ||
      !String(al.name ?? "").trim() ||
      !String(al.image_url ?? "").trim()
    );
  });
  if (albumIdsNeedingNetwork.length > 0) {
    await getOrFetchAlbumsBatch(albumIdsNeedingNetwork, {
      allowNetwork: true,
    });
    albumMeta = await fetchAlbumsBatch(admin, ids);
  }

  const artistIds = [
    ...new Set(
      ids
        .map((id) => albumMeta.get(id)?.artist_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  let artistMeta = await fetchArtistsBatch(admin, artistIds);
  if (artistIds.length > 0) {
    await getOrFetchArtistsBatch(artistIds, { allowNetwork: false });
    artistMeta = await fetchArtistsBatch(admin, artistIds);
    const artistIdsNeedingNetwork = artistIds.filter((id) => {
      const m = artistMeta.get(id);
      return !m?.name?.trim() || !m?.image_url?.trim();
    });
    if (artistIdsNeedingNetwork.length > 0) {
      await getOrFetchArtistsBatch(artistIdsNeedingNetwork, {
        allowNetwork: true,
      });
      artistMeta = await fetchArtistsBatch(admin, artistIds);
    }
  }

  const artistCounts = new Map<string, number>();
  for (const id of ids) {
    const aid = albumMeta.get(id)?.artist_id;
    if (aid) artistCounts.set(aid, (artistCounts.get(aid) ?? 0) + 1);
  }

  const topGenres = genreWeightsFromArtistCounts(artistCounts, artistMeta);

  const topAlbums: TasteTopAlbum[] = ids.map((id) => {
    const al = albumMeta.get(id);
    const artistName = al?.artist_id
      ? artistMeta.get(al.artist_id)?.name ?? "Unknown"
      : "Unknown";
    return {
      id,
      name: al?.name ?? "Album",
      artistName,
      listenCount: 5,
      imageUrl: al?.image_url ?? null,
    };
  });

  const topArtists: TasteTopArtist[] = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, count]) => {
      const m = artistMeta.get(id);
      return {
        id,
        name: m?.name ?? "Artist",
        listenCount: count * 5,
        imageUrl: m?.image_url ?? null,
      };
    });

  const diversityScore =
    topGenres.length === 0 ? 0 : Math.min(10, topGenres.length);

  const summary =
    topGenres.length > 0
      ? `Your taste starts with ${topGenres
          .slice(0, 3)
          .map((g) => g.name)
          .join(", ")} — log listens to go deeper.`
      : "Your taste starts with albums you picked — log listens to fill in more genres.";

  const payload: TasteIdentity = {
    topArtists,
    topAlbums,
    topGenres,
    obscurityScore: null,
    diversityScore,
    listeningStyle: "still-forming",
    avgTracksPerSession: 1,
    totalLogs: 0,
    summary,
    styleResult: null,
  };

  await upsertTasteIdentityCache(admin, userId, payload);
}

/**
 * Read `taste_identity_cache` (no log scan). Overlays fresh `image_url` from
 * `albums`/`artists`, then rehydrates top-album titles/artists (DB + Spotify if needed).
 */
export async function getTasteIdentity(userId: string): Promise<TasteIdentity> {
  const admin = createSupabaseAdminClient();

  const { data: cached, error: cacheErr } = await admin
    .from("taste_identity_cache")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (cacheErr || !cached?.payload) {
    return { ...EMPTY };
  }

  let identity = normalizeCachedTasteIdentity(
    cached.payload as TasteIdentity,
  );
  identity = await hydrateTasteIdentityArtwork(admin, identity);
  return hydrateTasteIdentityNamesFromCatalog(admin, identity);
}
