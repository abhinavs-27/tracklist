import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getArtists } from "@/lib/spotify";
import { upsertArtistFromSpotify } from "@/lib/spotify-cache";
import {
  normalizeListeningStyle,
  type TasteListeningStyle,
} from "./listening-style";
import type { TasteGenre, TasteIdentity, TasteTopAlbum, TasteTopArtist } from "./types";

export type { TasteGenre, TasteIdentity, TasteTopAlbum, TasteTopArtist } from "./types";
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
}): TasteListeningStyle {
  const {
    totalLogs,
    avgTrackPopularity,
    uniqueArtists,
    uniqueAlbums,
    uniqueGenres,
    daysSpan,
    maxLogsPerDay,
  } = args;

  const albumRatio = uniqueAlbums / Math.max(totalLogs, 1);
  const logsPerDay = totalLogs / Math.max(daysSpan, 1 / 24);

  type Scored = { style: TasteListeningStyle; score: number };
  const scores: Scored[] = [];

  if (totalLogs < 22) {
    scores.push({ style: "plotting-the-plot", score: 72 - totalLogs * 1.2 });
  }

  if (avgTrackPopularity != null && avgTrackPopularity > 70) {
    scores.push({
      style: "chart-gravity",
      score: 55 + (avgTrackPopularity - 70) * 1.1,
    });
  }

  if (avgTrackPopularity != null && avgTrackPopularity < 40) {
    scores.push({
      style: "deep-cuts-dept",
      score: 55 + (40 - avgTrackPopularity) * 1.0,
    });
  }

  if (uniqueArtists >= 45) scores.push({ style: "omnivore-mode", score: 88 });
  else if (uniqueArtists >= 30) scores.push({ style: "omnivore-mode", score: 74 });
  else if (uniqueArtists >= 20) scores.push({ style: "omnivore-mode", score: 58 });
  else if (uniqueGenres >= 14 && uniqueArtists >= 14) {
    scores.push({ style: "omnivore-mode", score: 52 + uniqueGenres * 0.4 });
  }

  if (totalLogs >= 28 && albumRatio < 0.2 && uniqueAlbums >= 3) {
    scores.push({ style: "album-gravity-well", score: 78 });
  } else if (totalLogs >= 18 && albumRatio < 0.28 && uniqueAlbums >= 2) {
    scores.push({ style: "album-gravity-well", score: 60 });
  }

  if (maxLogsPerDay >= 90 || logsPerDay >= 45) {
    scores.push({ style: "session-maximalist", score: 82 });
  } else if (maxLogsPerDay >= 45 || logsPerDay >= 28) {
    scores.push({ style: "session-maximalist", score: 64 });
  }

  if (scores.length === 0) return "plotting-the-plot";

  scores.sort((a, b) => b.score - a.score);
  return scores[0]!.style;
}

function buildSummary(t: TasteIdentity): string {
  if (t.totalLogs === 0) return EMPTY.summary;
  const bits: string[] = [];
  if (t.diversityScore >= 55) {
    bits.push("You explore a wide spread of genres.");
  } else if (t.diversityScore <= 30) {
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

function normalizeCachedTasteIdentity(cached: TasteIdentity): TasteIdentity {
  const listeningStyle = normalizeListeningStyle(String(cached.listeningStyle));
  const base = { ...cached, listeningStyle };
  if (base.totalLogs === 0) {
    return { ...base, summary: EMPTY.summary };
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
  const diversityScore =
    uniqueGenres === 0
      ? 0
      : Math.min(100, Math.round((uniqueGenres / 10) * 100));

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

  const albumMeta = await fetchAlbumsBatch(admin, topAlbumIds);
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
  return { ...base, summary: buildSummary(base) };
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

/** Single read of `taste_identity_cache` — no log scans, no Spotify, no artwork hydration. */
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

  return normalizeCachedTasteIdentity(cached.payload as TasteIdentity);
}
