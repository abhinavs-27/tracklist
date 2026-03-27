import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLastfmArtistGenres } from "@/lib/lastfm/get-artist-genres";
import { getLastfmTrackPopularityScore } from "@/lib/lastfm/get-track-info";
import { lastfmListenersOrPlaycountScore } from "@/lib/lastfm/metric-to-score";

export type CatalogPopularityBackfillResult = {
  /** Rows in DB with `songs.popularity` IS NULL (full table). */
  totalSongsWithNullPopularity: number | null;
  /** Rows in DB with `artists.popularity` IS NULL (full table). */
  totalArtistsWithNullPopularity: number | null;
  /** How many song IDs we tried this run (batch). */
  songBatchAttempted: number;
  /** How many artist IDs we tried this run (batch). */
  artistBatchAttempted: number;
  songsProcessed: number;
  artistsProcessed: number;
  errors: number;
  errorSamples: string[];
  warnings: string[];
  spacingMs: number;
  /** Set when a Supabase query failed (wrong project, RLS misconfig, missing column, etc.). */
  dbError?: string;
};

const DEFAULT_SONGS = 8;
const DEFAULT_ARTISTS = 8;
/** Extra pause between rows after Last.fm throttle (default 0). */
const DEFAULT_SPACING_MS = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Same log scale as Hidden Gems when catalog stats are missing. */
function popularityFromPlayCount(playCount: number): number {
  const c = Math.max(0, playCount);
  const denom = Math.log(100_001);
  const v = (Math.log(c + 1) / denom) * 100;
  return Math.min(100, Math.max(0, v));
}

async function processSong(
  supabase: SupabaseClient,
  spotifyId: string,
): Promise<void> {
  const { data: song, error: songErr } = await supabase
    .from("songs")
    .select("id, name, artist_id")
    .eq("id", spotifyId)
    .maybeSingle();

  if (songErr) throw new Error(songErr.message);
  if (!song || typeof song.name !== "string") {
    throw new Error("Song not found");
  }

  const { data: artist, error: artErr } = await supabase
    .from("artists")
    .select("name")
    .eq("id", (song as { artist_id: string }).artist_id)
    .maybeSingle();

  if (artErr) throw new Error(artErr.message);
  const artistName = (artist as { name?: string } | null)?.name?.trim() ?? "";
  if (!artistName) throw new Error("Artist name missing");

  let resolved = await getLastfmTrackPopularityScore(artistName, song.name);

  if (resolved === 0) {
    const { data: stat } = await supabase
      .from("entity_stats")
      .select("play_count")
      .eq("entity_type", "song")
      .eq("entity_id", spotifyId)
      .maybeSingle();
    const pc = (stat as { play_count?: number } | null)?.play_count;
    if (typeof pc === "number" && pc > 0) {
      resolved = Math.round(popularityFromPlayCount(pc));
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("songs")
    .update({
      popularity: resolved,
      updated_at: now,
      cached_at: now,
    })
    .eq("id", spotifyId);

  if (updErr) throw new Error(updErr.message);
}

async function processArtist(
  supabase: SupabaseClient,
  spotifyId: string,
): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", spotifyId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  const name = (row as { name?: string } | null)?.name?.trim() ?? "";
  if (!name) throw new Error("Artist not found");

  const info = await getLastfmArtistGenres(name);
  let pop = lastfmListenersOrPlaycountScore(info.listeners, info.playcount);

  if (pop === 0) {
    const { data: stat } = await supabase
      .from("entity_stats")
      .select("play_count")
      .eq("entity_type", "artist")
      .eq("entity_id", spotifyId)
      .maybeSingle();
    const pc = (stat as { play_count?: number } | null)?.play_count;
    if (typeof pc === "number" && pc > 0) {
      pop = Math.round(popularityFromPlayCount(pc));
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("artists")
    .update({
      popularity: pop,
      updated_at: now,
      cached_at: now,
    })
    .eq("id", spotifyId);

  if (updErr) throw new Error(updErr.message);
}

/**
 * Fills NULL `songs.popularity` / `artists.popularity` from Last.fm (track.getInfo /
 * artist.getInfo), with `entity_stats` play-count fallback, then 0.
 *
 * Run GET repeatedly until counts stay 0. Requires `LASTFM_API_KEY` and
 * `SUPABASE_SERVICE_ROLE_KEY` (service-role client).
 *
 * Set `includeFilled: true` to refresh rows that already have popularity (e.g. legacy
 * Spotify scores) — still processes oldest `updated_at` first, batch per run.
 */
export async function runCatalogPopularityBackfill(
  supabase: SupabaseClient,
  options?: {
    songBatch?: number;
    artistBatch?: number;
    /** Milliseconds between rows after each Last.fm-backed update (default 0). */
    spacingMs?: number;
    /** When true, select songs/artists regardless of `popularity` (recompute Last.fm). */
    includeFilled?: boolean;
  },
): Promise<CatalogPopularityBackfillResult> {
  const songBatch = options?.songBatch ?? DEFAULT_SONGS;
  const artistBatch = options?.artistBatch ?? DEFAULT_ARTISTS;
  const spacingMs = Math.max(0, options?.spacingMs ?? DEFAULT_SPACING_MS);
  const includeFilled = options?.includeFilled === true;

  const errors: string[] = [];
  const warnings: string[] = [];
  let dbError: string | undefined;

  const { count: totalSongsNull, error: countSongErr } = await supabase
    .from("songs")
    .select("id", { count: "exact", head: true })
    .is("popularity", null);

  const { count: totalArtistsNull, error: countArtistErr } = await supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .is("popularity", null);

  if (countSongErr) {
    dbError = `count songs (popularity IS NULL): ${countSongErr.message}`;
  } else if (countArtistErr) {
    dbError = `count artists (popularity IS NULL): ${countArtistErr.message}`;
  }

  let songQuery = supabase
    .from("songs")
    .select("id")
    .order("updated_at", { ascending: true })
    .limit(songBatch);
  if (!includeFilled) {
    songQuery = songQuery.is("popularity", null);
  }

  const { data: songIds, error: songSelectErr } = await songQuery;

  if (songSelectErr) {
    dbError = dbError
      ? `${dbError}; select songs: ${songSelectErr.message}`
      : `select songs: ${songSelectErr.message}`;
  }

  let artistQuery = supabase
    .from("artists")
    .select("id")
    .order("updated_at", { ascending: true })
    .limit(artistBatch);
  if (!includeFilled) {
    artistQuery = artistQuery.is("popularity", null);
  }

  const { data: artistIds, error: artistSelectErr } = await artistQuery;

  if (artistSelectErr) {
    dbError = dbError
      ? `${dbError}; select artists: ${artistSelectErr.message}`
      : `select artists: ${artistSelectErr.message}`;
  }

  let songsProcessed = 0;
  let artistsProcessed = 0;

  const songList = songIds ?? [];
  const artistList = artistIds ?? [];

  if (
    !includeFilled &&
    totalSongsNull === 0 &&
    totalArtistsNull === 0 &&
    !dbError
  ) {
    warnings.push(
      "No rows with popularity IS NULL — either everything is already filled (including 0), or run migration 059 (songs) / 061 (artists) if columns are missing. Use includeFilled to refresh existing scores.",
    );
  }

  for (let i = 0; i < songList.length; i++) {
    if (i > 0) await sleep(spacingMs);
    const sid = songList[i]!.id as string;
    try {
      await processSong(supabase, sid);
      songsProcessed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`song ${sid}: ${msg}`);
    }
  }

  if (songList.length > 0 && artistList.length > 0) {
    await sleep(spacingMs);
  }

  for (let i = 0; i < artistList.length; i++) {
    if (i > 0) await sleep(spacingMs);
    const aid = artistList[i]!.id as string;
    try {
      await processArtist(supabase, aid);
      artistsProcessed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`artist ${aid}: ${msg}`);
    }
  }

  return {
    totalSongsWithNullPopularity: totalSongsNull,
    totalArtistsWithNullPopularity: totalArtistsNull,
    songBatchAttempted: songList.length,
    artistBatchAttempted: artistList.length,
    songsProcessed,
    artistsProcessed,
    errors: errors.length,
    errorSamples: errors.slice(0, 40),
    warnings,
    spacingMs,
    dbError,
  };
}
