import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArtists } from "@/lib/spotify";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  upsertArtistFromSpotify,
} from "@/lib/spotify-cache";
import { scheduleEnrichArtistGenresForArtistIds } from "./enrich-artist-genres";
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

const EMPTY: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "plotting-the-plot",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "Log more listens to unlock your taste identity.",
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

function pickListeningStyle(args: {
  totalLogs: number;
  avgTrackPopularity: number | null;
  uniqueArtists: number;
  uniqueAlbums: number;
  uniqueGenres: number;
  daysSpan: number;
  maxLogsPerDay: number;
  /** Max plays for a single artist / totalLogs */
  topArtistShare: number;
}): TasteListeningStyle {
  const {
    totalLogs,
    avgTrackPopularity,
    uniqueArtists,
    uniqueAlbums,
    uniqueGenres,
    daysSpan,
    maxLogsPerDay,
    topArtistShare,
  } = args;

  const albumRatio = uniqueAlbums / Math.max(totalLogs, 1);
  const logsPerDay = totalLogs / Math.max(daysSpan, 1 / 24);
  /** Distinct artists per play — high means you rarely repeat the same artist. */
  const diversityRate = uniqueArtists / Math.max(totalLogs, 1);

  type Scored = { style: TasteListeningStyle; score: number };
  const scores: Scored[] = [];

  if (totalLogs < 22) {
    scores.push({ style: "plotting-the-plot", score: 72 - totalLogs * 1.2 });
  }

  /** Mainstream vs niche — wide bands; capped so one signal does not always win. */
  if (avgTrackPopularity != null && avgTrackPopularity > 64) {
    const raw = 56 + (avgTrackPopularity - 64) * 0.62;
    scores.push({
      style: "chart-gravity",
      score: Math.min(78, raw),
    });
  }

  if (avgTrackPopularity != null && avgTrackPopularity < 48) {
    const raw = 56 + (48 - avgTrackPopularity) * 0.62;
    scores.push({
      style: "deep-cuts-dept",
      score: Math.min(78, raw),
    });
  }

  /**
   * Omnivore: only for genuinely wide rotation (high diversity rate + many artists).
   * Scores stay **below** chart/deep/session peaks so popularity and habits win a mix.
   */
  if (uniqueArtists >= 70 && diversityRate >= 0.034) {
    scores.push({
      style: "omnivore-mode",
      score: 66 + Math.min(4, uniqueGenres * 0.1),
    });
  } else if (uniqueArtists >= 52 && diversityRate >= 0.04) {
    scores.push({
      style: "omnivore-mode",
      score: 60 + Math.min(4, uniqueGenres * 0.12),
    });
  } else if (
    uniqueArtists >= 42 &&
    diversityRate >= 0.045 &&
    uniqueGenres >= 11
  ) {
    scores.push({
      style: "omnivore-mode",
      score: 52 + Math.min(6, uniqueGenres * 0.35),
    });
  }

  /** Plays cluster on a few favorites — downweight if rotation is actually wide. */
  if (totalLogs >= 28 && topArtistShare >= 0.11) {
    let s = 55 + Math.min(28, (topArtistShare - 0.11) * 125);
    if (diversityRate > 0.045) s *= 0.9;
    if (diversityRate > 0.07) s *= 0.85;
    scores.push({ style: "mainstay-mode", score: s });
  }

  /** Consistent day-to-day volume, moderate spikes, mid rotation — not omnivore, not mainstay. */
  if (
    totalLogs >= 40 &&
    daysSpan >= 7 &&
    maxLogsPerDay >= 4 &&
    maxLogsPerDay <= 34 &&
    logsPerDay >= 3 &&
    logsPerDay <= 24 &&
    topArtistShare >= 0.06 &&
    topArtistShare <= 0.29 &&
    diversityRate >= 0.0025 &&
    diversityRate <= 0.022 &&
    uniqueArtists >= 8 &&
    uniqueArtists <= 72
  ) {
    scores.push({ style: "steady-rhythm", score: 68 });
  }

  if (totalLogs >= 28 && albumRatio < 0.2 && uniqueAlbums >= 3) {
    scores.push({ style: "album-gravity-well", score: 80 });
  } else if (totalLogs >= 18 && albumRatio < 0.28 && uniqueAlbums >= 2) {
    scores.push({ style: "album-gravity-well", score: 64 });
  }

  if (maxLogsPerDay >= 90 || logsPerDay >= 45) {
    scores.push({ style: "session-maximalist", score: 84 });
  } else if (maxLogsPerDay >= 45 || logsPerDay >= 28) {
    scores.push({ style: "session-maximalist", score: 68 });
  }

  if (scores.length === 0) return "plotting-the-plot";

  scores.sort((a, b) => b.score - a.score);
  return scores[0]!.style;
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
    case "album-gravity-well":
      bits.push("You circle back to the same albums a lot.");
      break;
    case "omnivore-mode":
      bits.push("You jump between a lot of different artists.");
      break;
    case "mainstay-mode":
      bits.push("Your plays keep circling back to the same few artists.");
      break;
    case "steady-rhythm":
      bits.push("You listen steadily without wild swings or huge binges.");
      break;
    case "chart-gravity":
      bits.push("A lot of your plays sit on the popular side.");
      break;
    case "deep-cuts-dept":
      bits.push("You lean toward tracks that aren’t the obvious singles.");
      break;
    case "session-maximalist":
      bits.push("Sometimes you rack up a ton of plays in one go.");
      break;
    case "plotting-the-plot":
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

function normalizeCachedTasteIdentity(cached: TasteIdentity): TasteIdentity {
  const listeningStyle = normalizeListeningStyle(String(cached.listeningStyle));
  const diversityScore = normalizeDiversityScore(cached.diversityScore);
  const base = { ...cached, listeningStyle, diversityScore };
  if (base.totalLogs === 0) {
    /** Onboarding seed: favorite albums and/or artist picks before first log. */
    if (
      (base.topArtists.length > 0 || base.topAlbums.length > 0) &&
      base.summary?.trim()
    ) {
      return { ...base, recent: undefined };
    }
    return { ...base, summary: EMPTY.summary, recent: undefined };
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

  const stillBad = topAlbums.filter((a) => needsAlbumNameFallback(a.name, a.id));
  if (stillBad.length > 0) {
    const spotifyAlbums = await getOrFetchAlbumsBatch(
      stillBad.map((a) => a.id),
      { allowNetwork: true },
    );
    const spotifyById = new Map(
      stillBad.map((a, i) => [a.id, spotifyAlbums[i] ?? null] as const),
    );
    topAlbums = topAlbums.map((al) => {
      const sa = spotifyById.get(al.id);
      if (!sa?.name?.trim()) return al;
      const artistN = sa.artists?.[0]?.name?.trim();
      return {
        ...al,
        name: sa.name.trim(),
        artistName: artistN ?? al.artistName,
        imageUrl: al.imageUrl ?? sa.images?.[0]?.url ?? null,
      };
    });
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
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
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
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
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
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("logs")
    .select("track_id, listened_at, album_id, artist_id")
    .eq("user_id", userId)
    .gte("listened_at", since30)
    .order("listened_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.warn("[taste-identity] recent window logs failed", error);
    return null;
  }
  const logs = (rows ?? []) as {
    track_id: string;
    listened_at: string;
    album_id: string | null;
    artist_id: string | null;
  }[];
  if (logs.length === 0) return null;

  const now = Date.now();
  const sevenMs = 7 * 24 * 60 * 60 * 1000;
  const logs7 = logs.filter((l) => now - new Date(l.listened_at).getTime() <= sevenMs);
  const slice = (x: (typeof logs)[number]) => ({
    track_id: x.track_id,
    album_id: x.album_id,
    artist_id: x.artist_id,
  });

  const [topGenres7d, topGenres30d] = await Promise.all([
    aggregateLogsToTopGenres(admin, logs7.map(slice)),
    aggregateLogsToTopGenres(admin, logs.map(slice)),
  ]);

  const insightWeek = buildRecentInsightSentence(
    topGenres7d,
    topGenres30d,
    logs7.length,
    logs.length,
  );

  return {
    logCount7d: logs7.length,
    logCount30d: logs.length,
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
  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("track_id, listened_at, album_id, artist_id")
    .eq("user_id", userId)
    .order("listened_at", { ascending: true })
    .limit(LOG_CAP);

  if (logErr || !logRows?.length) {
    if (logErr) {
      console.error("[taste-identity] logs query failed (match)", logErr);
    }
    return none();
  }

  const logs = logRows as {
    track_id: string;
    listened_at: string;
    album_id: string | null;
    artist_id: string | null;
  }[];

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))];
  const songMap = await fetchSongsBatch(admin, trackIds);

  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const trackCounts = new Map<string, number>();

  for (const log of logs) {
    const song = songMap.get(log.track_id);
    const artistId = log.artist_id ?? song?.artist_id ?? null;
    if (artistId) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
    }
    const albId =
      log.album_id?.trim() || song?.album_id?.trim() || null;
    if (albId) {
      albumCounts.set(albId, (albumCounts.get(albId) ?? 0) + 1);
    }
    const tid = log.track_id?.trim();
    if (tid) {
      trackCounts.set(tid, (trackCounts.get(tid) ?? 0) + 1);
    }
  }

  if (artistCounts.size === 0) return none();

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
  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("track_id, listened_at, album_id, artist_id")
    .eq("user_id", userId)
    .order("listened_at", { ascending: true })
    .limit(LOG_CAP);

  if (logErr) {
    console.error("[taste-identity] logs query failed", logErr);
    return { ...EMPTY, summary: "Could not load listening history." };
  }

  const logs = (logRows ?? []) as {
    track_id: string;
    listened_at: string;
    album_id: string | null;
    artist_id: string | null;
  }[];

  const totalLogs = logs.length;
  if (totalLogs === 0) {
    return { ...EMPTY };
  }

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))];
  const songMap = await fetchSongsBatch(admin, trackIds);

  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const popularities: number[] = [];
  const artistIdsForMeta = new Set<string>();

  for (const log of logs) {
    const song = songMap.get(log.track_id);
    const albumId = log.album_id ?? song?.album_id ?? null;
    const artistId = log.artist_id ?? song?.artist_id ?? null;

    if (artistId) {
      artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
      artistIdsForMeta.add(artistId);
    }
    if (albumId) {
      albumCounts.set(albumId, (albumCounts.get(albumId) ?? 0) + 1);
    }

    const pop = song?.popularity;
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

  const listenedTimes = logs.map((l) => new Date(l.listened_at).getTime());
  let sessions = 1;
  for (let i = 1; i < listenedTimes.length; i++) {
    if (listenedTimes[i]! - listenedTimes[i - 1]! > SESSION_GAP_MS) {
      sessions += 1;
    }
  }
  const avgTracksPerSession =
    sessions > 0 ? Math.round((totalLogs / sessions) * 10) / 10 : totalLogs;

  const uniqueAlbums = albumCounts.size;

  const t0 = new Date(logs[0]!.listened_at).getTime();
  const t1 = new Date(logs[logs.length - 1]!.listened_at).getTime();
  const daysSpan = Math.max((t1 - t0) / (24 * 60 * 60 * 1000), 1 / 24);

  const mlpd = maxLogsPerDay(logs);

  let maxArtistPlays = 0;
  for (const c of artistCounts.values()) {
    if (c > maxArtistPlays) maxArtistPlays = c;
  }
  const topArtistShare = totalLogs > 0 ? maxArtistPlays / totalLogs : 0;

  const avgTrackPopularity =
    popularities.length > 0
      ? popularities.reduce((a, b) => a + b, 0) / popularities.length
      : null;

  const listeningStyle = pickListeningStyle({
    totalLogs,
    avgTrackPopularity,
    uniqueArtists: artistCounts.size,
    uniqueAlbums,
    uniqueGenres,
    daysSpan,
    maxLogsPerDay: mlpd,
    topArtistShare,
  });

  const topArtistIds = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id]) => id);

  const missingImages = topArtistIds.filter((id) => {
    const m = artistMeta.get(id);
    return !m?.image_url;
  });
  if (missingImages.length > 0) {
    await enrichTopArtistsFromSpotify(admin, missingImages.slice(0, 10));
    artistMeta = await fetchArtistsBatch(admin, [...artistIdsForMeta]);
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
  const idsNeedingAlbumFill = topAlbumIds.filter((id) => {
    const al = albumMeta.get(id);
    return !al || !String(al.name ?? "").trim();
  });
  if (idsNeedingAlbumFill.length > 0) {
    const spotifyAlbums = await getOrFetchAlbumsBatch(idsNeedingAlbumFill, {
      allowNetwork: true,
    });
    albumMeta = new Map(albumMeta);
    for (let i = 0; i < idsNeedingAlbumFill.length; i++) {
      const id = idsNeedingAlbumFill[i]!;
      const sa = spotifyAlbums[i];
      if (!sa?.name?.trim()) continue;
      const prev = albumMeta.get(id);
      const artistId =
        sa.artists?.[0]?.id?.trim() ?? prev?.artist_id?.trim() ?? "";
      albumMeta.set(id, {
        name: sa.name,
        artist_id: artistId || prev?.artist_id || "",
        image_url: prev?.image_url ?? sa.images?.[0]?.url ?? null,
      });
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
    listeningStyle,
    avgTracksPerSession,
    totalLogs,
    summary: "",
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

  await getOrFetchAlbumsBatch(ids);

  const albumMeta = await fetchAlbumsBatch(admin, ids);
  const artistIds = [
    ...new Set(
      ids
        .map((id) => albumMeta.get(id)?.artist_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  if (artistIds.length > 0) {
    await getOrFetchArtistsBatch(artistIds);
  }

  const artistMeta = await fetchArtistsBatch(admin, artistIds);

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
      : "Your taste starts with albums you picked — log listens to unlock richer genres.";

  const payload: TasteIdentity = {
    topArtists,
    topAlbums,
    topGenres,
    obscurityScore: null,
    diversityScore,
    listeningStyle: "plotting-the-plot",
    avgTracksPerSession: 1,
    totalLogs: 0,
    summary,
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
