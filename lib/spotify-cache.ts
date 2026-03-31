import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logPerf, timeAsync } from "@/lib/profiling";
import {
  getAlbum,
  getAllAlbumTracks,
  getAlbums,
  getArtist,
  getArtistAlbums,
  getTrack,
  getTracks,
  searchSpotify,
} from "@/lib/spotify";
import { pickBestArtistMatch } from "@/lib/spotify/matching";
import { MAX_SPOTIFY_ITEMS } from "@/lib/spotify/client";
import {
  catalogReadsAllowSpotifyNetwork,
  type CatalogFetchOpts,
} from "@/lib/spotify/catalog-read-policy";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  findAlbumIdByArtistAndName,
  findArtistIdByNormalizedName,
  findTrackIdByArtistAlbumAndName,
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
  linkTrackExternalId,
} from "@/lib/catalog/entity-resolution";
import {
  isValidLfmCatalogId,
  isValidSpotifyId,
  isValidUuid,
  normalizeReviewEntityId,
} from "@/lib/validation";

export type { CatalogFetchOpts } from "@/lib/spotify/catalog-read-policy";

const LOG_PREFIX = "[spotify-cache]";

/** PostgREST `.in()` URL size stays reasonable; Spotify batches use MAX_SPOTIFY_ITEMS. */
const SUPABASE_IN_CHUNK = 120;

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function emptyTrackPaging(): SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> {
  return {
    items: [],
    total: 0,
    limit: 0,
    offset: 0,
    next: null,
    previous: null,
  };
}

/** TTL for cached Spotify data: refresh if older than this (default 30 days). */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** In-memory dedupe: same batch requested again within 5s returns cached (e.g. during one render). */
const BATCH_MEMORY_TTL_MS = 5000;
const batchMemoryCache = new Map<
  string,
  { data: Map<string, unknown>; at: number }
>();
/**
 * Batch in-memory cache (short TTL). Must include whether Spotify was allowed:
 * otherwise a DB-only pass poisons the key for a follow-up `{ allowNetwork: true }` call.
 */
function getBatchCacheKey(
  prefix: string,
  ids: string[],
  catalogAllowsNet: boolean,
): string {
  const sorted = [...new Set(ids)].filter(Boolean).sort().join(",");
  return `${prefix}:${sorted}:cn=${catalogAllowsNet ? "1" : "0"}`;
}
function getFromBatchMemoryMap(key: string): Map<string, unknown> | null {
  const entry = batchMemoryCache.get(key);
  if (!entry || Date.now() - entry.at > BATCH_MEMORY_TTL_MS) {
    if (entry) batchMemoryCache.delete(key);
    return null;
  }
  return entry.data;
}
function setBatchMemoryMap(key: string, data: Map<string, unknown>): void {
  batchMemoryCache.set(key, { data, at: Date.now() });
  if (batchMemoryCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of batchMemoryCache.entries()) {
      if (now - v.at > BATCH_MEMORY_TTL_MS) batchMemoryCache.delete(k);
    }
  }
}

function logCacheMiss(entity: string, id: string) {
  console.log(`${LOG_PREFIX} cache miss: ${entity} id=${id}`);
}

function logUpsert(_entity: string, _id: string) {
  // No-op by default; set SPOTIFY_CACHE_LOG_UPSERT=1 to debug
  if (process.env.SPOTIFY_CACHE_LOG_UPSERT === "1") {
    console.log(`${LOG_PREFIX} upsert: ${_entity} id=${_id}`);
  }
}

function isCacheStale(cachedAt: string | null | undefined): boolean {
  if (!cachedAt) return true;
  return Date.now() - new Date(cachedAt).getTime() > CACHE_TTL_MS;
}

/** DB has fewer songs than Spotify's total_tracks, or we never stored total_tracks on a non-empty album. */
function albumNeedsTrackBackfill(
  songCount: number,
  totalTracksNullable: number | null,
): boolean {
  const totalTracks = totalTracksNullable ?? 0;
  return (
    songCount === 0 ||
    (totalTracks > 0 && songCount < totalTracks) ||
    (songCount > 0 && totalTracks === 0)
  );
}

// --- DB row types (match 009_spotify_entities + 035_spotify_cached_at)

type ArtistRow = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[] | null;
  popularity?: number | null;
  lastfm_fetched_at?: string | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
};

type AlbumRow = {
  id: string;
  name: string;
  artist_id: string;
  image_url: string | null;
  release_date: string | null;
  total_tracks: number | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
};

type SongRow = {
  id: string;
  name: string;
  album_id: string | null;
  artist_id: string | null;
  duration_ms: number | null;
  track_number: number | null;
  popularity?: number | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
  lastfm_name?: string | null;
  lastfm_artist_name?: string | null;
};

function buildSyntheticLfmTrack(
  song: SongRow,
): SpotifyApi.TrackObjectFull {
  const aid = song.artist_id ?? "lfm-unknown";
  const displayName =
    (song.name && song.name.trim()) ||
    (song.lastfm_name && song.lastfm_name.trim()) ||
    "Track";
  const displayArtist =
    (song.lastfm_artist_name && song.lastfm_artist_name.trim()) || "Artist";
  return {
    id: song.id,
    name: displayName,
    artists: [
      {
        id: aid,
        name: displayArtist,
      },
    ],
    duration_ms: song.duration_ms ?? undefined,
    album: undefined,
  } as SpotifyApi.TrackObjectFull;
}

/** Keep Last.fm external id as the client-facing track id when dual-mapped. */
function withCanonicalSongId(
  lfmId: string,
  track: SpotifyApi.TrackObjectFull,
): SpotifyApi.TrackObjectFull {
  return {
    ...track,
    id: lfmId,
  } as SpotifyApi.TrackObjectFull;
}

/** Mirror `resolveTrackSpotifyJob`: persist Spotify ids onto the synthetic `lfm:*` row (service role). */
async function persistLfmSongSpotifyLink(
  lfmSongId: string,
  track: SpotifyApi.TrackObjectFull,
): Promise<void> {
  const alb = track.album;
  const first = track.artists?.[0];
  if (!alb || !first) return;

  const supabase = createSupabaseAdminClient();
  const trackWithPop = track as SpotifyApi.TrackObjectFull & {
    popularity?: number;
  };
  const pop =
    typeof trackWithPop.popularity === "number"
      ? trackWithPop.popularity
      : null;
  const now = new Date().toISOString();

  const trackUuid = await getTrackIdByExternalId(
    supabase,
    "lastfm",
    lfmSongId,
  );
  if (!trackUuid) {
    console.warn(
      `${LOG_PREFIX} persistLfmSongSpotifyLink: no canonical track for`,
      lfmSongId,
    );
    return;
  }

  const albumUuid = await upsertAlbumFromSpotify(
    supabase,
    alb as SpotifyApi.AlbumObjectSimplified,
  );
  const artistUuid = await upsertArtistFromSpotify(supabase, first);

  const { error } = await supabase
    .from("tracks")
    .update({
      name: track.name,
      album_id: albumUuid,
      artist_id: artistUuid,
      duration_ms: track.duration_ms ?? null,
      popularity: pop,
      data_source: "mixed",
      needs_spotify_enrichment: false,
      updated_at: now,
      cached_at: now,
    })
    .eq("id", trackUuid);

  if (error) {
    console.warn(`${LOG_PREFIX} persistLfmSongSpotifyLink failed`, lfmSongId, error);
    return;
  }

  await linkTrackExternalId(supabase, trackUuid, "spotify", track.id);
}

async function resolveTrackCanonicalId(
  supabase: SupabaseClient,
  raw: string,
): Promise<string | null> {
  const id = normalizeReviewEntityId(raw);
  if (isValidUuid(id)) return id;
  if (isValidSpotifyId(id)) {
    return await getTrackIdByExternalId(supabase, "spotify", id);
  }
  if (isValidLfmCatalogId(id)) {
    return await getTrackIdByExternalId(supabase, "lastfm", id);
  }
  return null;
}

async function getSpotifyExternalForTrack(
  supabase: SupabaseClient,
  trackCanonicalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("track_external_ids")
    .select("external_id")
    .eq("track_id", trackCanonicalId)
    .eq("source", "spotify")
    .limit(1)
    .maybeSingle();
  const ext = (data as { external_id?: string } | null)?.external_id;
  return ext && isValidSpotifyId(ext) ? ext : null;
}

async function getLastfmExternalForTrack(
  supabase: SupabaseClient,
  trackCanonicalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("track_external_ids")
    .select("external_id")
    .eq("track_id", trackCanonicalId)
    .eq("source", "lastfm")
    .limit(1)
    .maybeSingle();
  const ext = (data as { external_id?: string } | null)?.external_id;
  return ext && isValidLfmCatalogId(ext) ? ext : null;
}

/**
 * When Spotify mapping is missing but we have Last.fm title/artist strings, resolve via search (same as enrichment job).
 */
async function tryResolveLfmSongViaLastfmSearch(
  song: SongRow,
  opts: CatalogFetchOpts | undefined,
): Promise<SpotifyApi.TrackObjectFull | null> {
  const trackName =
    (song.name && song.name.trim()) ||
    (song.lastfm_name && song.lastfm_name.trim()) ||
    "";
  const artistName =
    (song.lastfm_artist_name && song.lastfm_artist_name.trim()) || "";
  if (!trackName || !artistName) return null;

  const match = await mapLastfmToSpotify(
    trackName,
    artistName,
    null,
    { durationMs: song.duration_ms ?? undefined },
  );
  if (!match) return null;

  try {
    const track = await getOrFetchTrackInner(match.trackId, opts);
    const admin = createSupabaseAdminClient();
    const lfmKey = await getLastfmExternalForTrack(admin, song.id);
    if (lfmKey) {
      try {
        await persistLfmSongSpotifyLink(lfmKey, track);
      } catch (e) {
        console.warn(`${LOG_PREFIX} persistLfmSongSpotifyLink (search path)`, e);
      }
      return withCanonicalSongId(lfmKey, track);
    }
    return track;
  } catch (e) {
    console.warn(`${LOG_PREFIX} tryResolveLfmSongViaLastfmSearch failed`, {
      songId: song.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function trackFromDbSongRow(
  supabase: SupabaseClient,
  song: SongRow,
): Promise<SpotifyApi.TrackObjectFull> {
  const albumPromise = song.album_id
    ? supabase
        .from("albums")
        .select("id, name, artist_id, image_url, release_date")
        .eq("id", song.album_id)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const artistPromise = song.artist_id
    ? supabase
        .from("artists")
        .select("id, name, image_url, genres")
        .eq("id", song.artist_id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: albumRow }, { data: artistRow }] = await Promise.all([
    albumPromise,
    artistPromise,
  ]);

  const album = albumRow as unknown as AlbumRow | null;
  const artist = artistRow as unknown as ArtistRow | null;

  const trackTitle =
    (song.name && song.name.trim()) ||
    (song.lastfm_name && song.lastfm_name.trim()) ||
    "Track";
  const spotifyTrackId = await getSpotifyExternalForTrack(supabase, song.id);
  const displayTrackId = spotifyTrackId ?? song.id;
  return {
    id: displayTrackId,
    name: trackTitle,
    artists: [
      {
        id: song.artist_id ?? "",
        name:
          artist?.name?.trim() ||
          (song.lastfm_artist_name && song.lastfm_artist_name.trim()) ||
          "Artist",
      },
    ],
    duration_ms: song.duration_ms ?? undefined,
    album: album
      ? {
          id: album.id,
          name: album.name,
          artists: [
            {
              id: album.artist_id,
              name: artist?.name ?? "",
            },
          ],
          images: album.image_url ? [{ url: album.image_url }] : undefined,
          release_date: album.release_date ?? undefined,
        }
      : undefined,
  };
}

// --- Helpers: upsert from Spotify payloads

/** Spotify returns several sizes; `images[0]` is not always the first non-empty URL. */
export function firstSpotifyImageUrl(
  images: SpotifyApi.ImageObject[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  return images.find((im) => im?.url?.trim())?.url?.trim() ?? null;
}

function albumCoverUrlFromTrackPayload(
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
): string | null {
  const album = "album" in track ? track.album : undefined;
  if (!album || !("images" in album)) return null;
  return firstSpotifyImageUrl(album.images);
}

/** Persist the best cover we can when first inserting or refreshing a track + album row. */
function resolveAlbumImageForTrackUpsert(
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  explicitAlbumImageUrl: string | null,
  existingAlbumImageUrl: string | null | undefined,
): string | null {
  if (explicitAlbumImageUrl?.trim()) return explicitAlbumImageUrl.trim();
  const fromTrack = albumCoverUrlFromTrackPayload(track);
  if (fromTrack) return fromTrack;
  if (existingAlbumImageUrl?.trim()) return existingAlbumImageUrl.trim();
  return null;
}

function clampPopularity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Spotify typings omit `popularity` on some builds; API returns it for full artists. */
type ArtistWithPopularity = SpotifyApi.ArtistObjectFull & {
  popularity?: number;
};

export async function upsertArtistFromSpotify(
  supabase: SupabaseClient,
  a: SpotifyApi.ArtistObjectFull | SpotifyApi.ArtistObjectSimplified,
  options?: {
    /** Full Spotify payload: skip read-before-write (halves DB round-trips for batch backfills). */
    skipMerge?: boolean;
  },
): Promise<string> {
  const now = new Date().toISOString();
  const spotifyKey = a.id;

  type ArtistMergeRow = {
    genres: string[] | null;
    popularity: number | null;
    image_url: string | null;
  };

  let artistUuid =
    (await getArtistIdByExternalId(supabase, "spotify", spotifyKey)) ??
    (await findArtistIdByNormalizedName(supabase, a.name));

  let ex: ArtistMergeRow | null = null;
  if (artistUuid && !options?.skipMerge) {
    const { data: existing } = await supabase
      .from("artists")
      .select("genres, popularity, image_url")
      .eq("id", artistUuid)
      .maybeSingle();
    ex = existing as ArtistMergeRow | null;
  }

  const newGenres =
    "genres" in a && Array.isArray(a.genres) && a.genres.length > 0
      ? a.genres
      : (ex?.genres ?? null);

  const ap = a as ArtistWithPopularity;
  const newPop =
    typeof ap.popularity === "number"
      ? clampPopularity(ap.popularity)
      : (ex?.popularity ?? null);

  const newImage =
    "images" in a && a.images?.length
      ? firstSpotifyImageUrl(a.images) ?? ex?.image_url ?? null
      : (ex?.image_url ?? null);

  if (!artistUuid) {
    const { data: inserted, error: insErr } = await supabase
      .from("artists")
      .insert({
        name: a.name,
        image_url: newImage,
        genres: newGenres,
        popularity: newPop,
        updated_at: now,
        cached_at: now,
        data_source: "spotify" as const,
        needs_spotify_enrichment: false,
        last_updated: now,
      })
      .select("id")
      .single();
    if (insErr) {
      console.error(`${LOG_PREFIX} artists insert failed`, insErr);
      throw new Error(`artists insert: ${insErr.message}`);
    }
    artistUuid = inserted!.id as string;
  } else {
    const { error: upErr } = await supabase
      .from("artists")
      .update({
        name: a.name,
        image_url: newImage,
        genres: newGenres,
        popularity: newPop,
        updated_at: now,
        cached_at: now,
        data_source: "spotify" as const,
        needs_spotify_enrichment: false,
        last_updated: now,
      })
      .eq("id", artistUuid);
    if (upErr) {
      console.error(`${LOG_PREFIX} artists update failed`, upErr);
      throw new Error(`artists update: ${upErr.message}`);
    }
  }

  await linkArtistExternalId(supabase, artistUuid, "spotify", spotifyKey);
  logUpsert("artist", artistUuid);
  return artistUuid;
}

export async function upsertAlbumFromSpotify(
  supabase: SupabaseClient,
  album: SpotifyApi.AlbumObjectFull | SpotifyApi.AlbumObjectSimplified,
): Promise<string> {
  const first = album.artists?.[0];
  if (!first) throw new Error("Album has no artist");

  const artistUuid = await upsertArtistFromSpotify(supabase, first);
  const now = new Date().toISOString();

  let albumUuid =
    (await getAlbumIdByExternalId(supabase, "spotify", album.id)) ??
    (await findAlbumIdByArtistAndName(supabase, artistUuid, album.name));

  const row = {
    name: album.name,
    artist_id: artistUuid,
    image_url: firstSpotifyImageUrl(album.images) ?? null,
    release_date: "release_date" in album ? (album.release_date ?? null) : null,
    total_tracks: "total_tracks" in album ? (album.total_tracks ?? null) : null,
    updated_at: now,
    cached_at: now,
  };

  if (!albumUuid) {
    const { data: inserted, error: insErr } = await supabase
      .from("albums")
      .insert(row)
      .select("id")
      .single();
    if (insErr) {
      console.error(`${LOG_PREFIX} albums insert failed`, insErr);
      throw new Error(`albums insert: ${insErr.message}`);
    }
    albumUuid = inserted!.id as string;
  } else {
    const { error: upErr } = await supabase
      .from("albums")
      .update(row)
      .eq("id", albumUuid);
    if (upErr) {
      console.error(`${LOG_PREFIX} albums update failed`, upErr);
      throw new Error(`albums update: ${upErr.message}`);
    }
  }

  await linkAlbumExternalId(supabase, albumUuid, "spotify", album.id);
  logUpsert("album", albumUuid);
  return albumUuid;
}

export async function upsertTrackFromSpotify(
  supabase: SupabaseClient,
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  albumSpotifyId: string,
  albumName: string,
  albumImageUrl: string | null,
  albumReleaseDate?: string,
): Promise<string> {
  const first = track.artists?.[0];
  if (!first) throw new Error("Track has no artist");
  if (!track.name?.trim()) {
    throw new Error("refuse to upsert song without track name");
  }
  if (!first.name?.trim()) {
    throw new Error("refuse to upsert song without artist name");
  }

  const artistUuid = await upsertArtistFromSpotify(supabase, first);

  let albumUuid =
    (await getAlbumIdByExternalId(supabase, "spotify", albumSpotifyId)) ??
    (await findAlbumIdByArtistAndName(supabase, artistUuid, albumName));

  const { data: existingAlbum } = albumUuid
    ? await supabase
        .from("albums")
        .select("total_tracks, image_url")
        .eq("id", albumUuid)
        .maybeSingle()
    : { data: null };

  const resolvedAlbumImage = resolveAlbumImageForTrackUpsert(
    track,
    albumImageUrl,
    (existingAlbum as { image_url?: string | null } | null)?.image_url,
  );

  const now = new Date().toISOString();
  const albumPayload = {
    name: albumName,
    artist_id: artistUuid,
    image_url: resolvedAlbumImage,
    release_date: albumReleaseDate ?? null,
    total_tracks:
      (existingAlbum as { total_tracks?: number | null } | null)?.total_tracks ??
      null,
    updated_at: now,
    cached_at: now,
  };

  if (!albumUuid) {
    const { data: insAlb, error: albumErr } = await supabase
      .from("albums")
      .insert(albumPayload)
      .select("id")
      .single();
    if (albumErr) {
      console.error(`${LOG_PREFIX} albums upsert (from track) failed`, albumErr);
      throw new Error(`albums insert (from track): ${albumErr.message}`);
    }
    albumUuid = insAlb!.id as string;
  } else {
    const { error: albumErr } = await supabase
      .from("albums")
      .update(albumPayload)
      .eq("id", albumUuid);
    if (albumErr) {
      console.error(`${LOG_PREFIX} albums upsert (from track) failed`, albumErr);
      throw new Error(`albums update (from track): ${albumErr.message}`);
    }
  }
  await linkAlbumExternalId(supabase, albumUuid, "spotify", albumSpotifyId);
  logUpsert("album", albumUuid);

  const trackNumber =
    "track_number" in track
      ? ((track as { track_number?: number }).track_number ?? null)
      : null;

  const trackWithPop = track as SpotifyApi.TrackObjectFull & {
    popularity?: number;
  };
  const pop =
    typeof trackWithPop.popularity === "number"
      ? trackWithPop.popularity
      : null;

  let trackUuid =
    (await getTrackIdByExternalId(supabase, "spotify", track.id)) ??
    (await findTrackIdByArtistAlbumAndName(
      supabase,
      artistUuid,
      albumUuid,
      track.name,
    ));

  const trackPayload = {
    name: track.name,
    album_id: albumUuid,
    artist_id: artistUuid,
    duration_ms: track.duration_ms ?? null,
    track_number: trackNumber,
    popularity: pop,
    updated_at: now,
    cached_at: now,
    data_source: "spotify" as const,
    needs_spotify_enrichment: false,
  };

  if (!trackUuid) {
    const { data: insTr, error: trErr } = await supabase
      .from("tracks")
      .insert(trackPayload)
      .select("id")
      .single();
    if (trErr) {
      console.error(`${LOG_PREFIX} tracks insert failed`, trErr);
      throw new Error(`tracks insert: ${trErr.message}`);
    }
    trackUuid = insTr!.id as string;
  } else {
    const { error: trErr } = await supabase
      .from("tracks")
      .update(trackPayload)
      .eq("id", trackUuid);
    if (trErr) {
      console.error(`${LOG_PREFIX} tracks update failed`, trErr);
      throw new Error(`tracks update: ${trErr.message}`);
    }
  }

  await linkTrackExternalId(supabase, trackUuid, "spotify", track.id);
  logUpsert("track", trackUuid);
  return trackUuid;
}

/** Upsert track row when album + artist canonical rows already exist (full-album hydrate). */
async function upsertTrackRowOnly(
  supabase: SupabaseClient,
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  albumCanonicalId: string,
  artistCanonicalId: string,
): Promise<string> {
  if (!track.name?.trim()) {
    throw new Error("refuse to upsert song without track name");
  }
  const trackNumber =
    "track_number" in track
      ? ((track as { track_number?: number }).track_number ?? null)
      : null;
  const now = new Date().toISOString();
  const trackWithPop = track as SpotifyApi.TrackObjectFull & {
    popularity?: number;
  };
  const pop =
    typeof trackWithPop.popularity === "number"
      ? trackWithPop.popularity
      : null;

  let trackUuid =
    (await getTrackIdByExternalId(supabase, "spotify", track.id)) ??
    (await findTrackIdByArtistAlbumAndName(
      supabase,
      artistCanonicalId,
      albumCanonicalId,
      track.name,
    ));

  const trackPayload = {
    name: track.name,
    album_id: albumCanonicalId,
    artist_id: artistCanonicalId,
    duration_ms: track.duration_ms ?? null,
    track_number: trackNumber,
    popularity: pop,
    updated_at: now,
    cached_at: now,
    data_source: "spotify" as const,
    needs_spotify_enrichment: false,
  };

  if (!trackUuid) {
    const { data: ins, error } = await supabase
      .from("tracks")
      .insert(trackPayload)
      .select("id")
      .single();
    if (error) {
      console.error(`${LOG_PREFIX} tracks insert failed`, error);
      throw new Error(`tracks insert: ${error.message}`);
    }
    trackUuid = ins!.id as string;
  } else {
    const { error } = await supabase
      .from("tracks")
      .update(trackPayload)
      .eq("id", trackUuid);
    if (error) {
      console.error(`${LOG_PREFIX} tracks update failed`, error);
      throw new Error(`tracks update: ${error.message}`);
    }
  }
  await linkTrackExternalId(supabase, trackUuid, "spotify", track.id);
  return trackUuid;
}

/**
 * Spotify Web API paths (`/artists/{id}`, `/artists/{id}/albums`) require a base62 catalog id.
 * Callers may pass a Spotify id or a canonical UUID — resolve via `artist_external_ids` before any GET.
 *
 * When no Spotify mapping exists, {@link resolveArtistSpotifyJob} can search and link the row.
 */
export async function resolveCanonicalArtistIdToSpotifyApiId(
  rawId: string,
): Promise<string | null> {
  const id = normalizeReviewEntityId(rawId);
  if (isValidSpotifyId(id)) return id;

  const supabase = createSupabaseAdminClient();

  async function spotifyIdForCanonicalArtist(
    artistUuid: string,
  ): Promise<string | null> {
    const { data: m } = await supabase
      .from("artist_external_ids")
      .select("external_id")
      .eq("artist_id", artistUuid)
      .eq("source", "spotify")
      .limit(1)
      .maybeSingle();
    const ext = (m as { external_id?: string } | null)?.external_id;
    return ext && isValidSpotifyId(ext) ? ext : null;
  }

  let artistUuid: string | null = null;
  if (isValidUuid(id)) {
    artistUuid = id;
  } else if (isValidLfmCatalogId(id)) {
    artistUuid = await getArtistIdByExternalId(supabase, "lastfm", id);
  }

  if (artistUuid) {
    const sid = await spotifyIdForCanonicalArtist(artistUuid);
    if (sid) return sid;

    const { data: row } = await supabase
      .from("artists")
      .select("id, name")
      .eq("id", artistUuid)
      .maybeSingle();
    const name = (row as { name?: string } | null)?.name?.trim();
    if (!name) return null;

    try {
      const res = await searchSpotify(name, ["artist"], 5, {
        allowLastfmMapping: true,
      });
      const items = res.artists?.items ?? [];
      const pick = pickBestArtistMatch(name, items);
      if (!pick) return null;

      const fullPop = pick as SpotifyApi.ArtistObjectFull & {
        popularity?: number;
      };
      const pop =
        typeof fullPop.popularity === "number"
          ? clampPopularity(fullPop.popularity)
          : null;
      const genres =
        "genres" in pick && Array.isArray(pick.genres) && pick.genres.length > 0
          ? pick.genres
          : null;
      const imageUrl =
        "images" in pick && pick.images?.[0]?.url ? pick.images[0].url : null;
      const now = new Date().toISOString();

      await linkArtistExternalId(supabase, artistUuid, "spotify", pick.id);
      const { error } = await supabase
        .from("artists")
        .update({
          name: pick.name,
          image_url: imageUrl,
          genres,
          popularity: pop,
          needs_spotify_enrichment: false,
          data_source: "mixed",
          last_updated: now,
          updated_at: now,
          cached_at: now,
        })
        .eq("id", artistUuid);
      if (error) {
        console.warn(
          `${LOG_PREFIX} resolveCanonicalArtistIdToSpotifyApiId link failed`,
          error,
        );
      }
      return pick.id;
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} resolveCanonicalArtistIdToSpotifyApiId search failed`,
        id,
        e,
      );
      return null;
    }
  }

  return null;
}

// --- getOrFetchArtist (DB-first cache + TTL)

async function getOrFetchArtistInner(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<SpotifyApi.ArtistObjectFull> {
  const supabase = await createSupabaseServerClient();
  const net = catalogReadsAllowSpotifyNetwork(opts);

  const { data: row, error } = await supabase
    .from("artists")
    .select("id, name, image_url, genres, popularity, cached_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} artists select failed`, error);
  }

  if (row) {
    const a = row as unknown as ArtistRow;

    if (a.image_url) {
      return {
        id: a.id,
        name: a.name,
        images: [{ url: a.image_url }],
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }

    if (!net) {
      return {
        id: a.id,
        name: a.name,
        images: undefined,
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }

    try {
      const apiId = await resolveCanonicalArtistIdToSpotifyApiId(a.id);
      if (!apiId) {
        return {
          id: a.id,
          name: a.name,
          images: undefined,
          genres: a.genres ?? undefined,
          popularity: typeof a.popularity === "number" ? a.popularity : 0,
          followers: { total: 0 },
        } as SpotifyApi.ArtistObjectFull;
      }
      const artist = await getArtist(apiId);
      try {
        await upsertArtistFromSpotify(createSupabaseAdminClient(), artist);
      } catch (e) {
        console.error(
          `${LOG_PREFIX} upsertArtistFromSpotify (backfill image) error`,
          e,
        );
      }
      return { ...artist, id: a.id } as SpotifyApi.ArtistObjectFull;
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} getArtist (no image in DB) failed, using cached row`,
        e,
      );
      return {
        id: a.id,
        name: a.name,
        images: undefined,
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }
  }

  logCacheMiss("artist", id);

  if (!net) {
    return {
      id,
      name: id,
      images: undefined,
      genres: [],
      popularity: 0,
      followers: { total: 0 },
    } as SpotifyApi.ArtistObjectFull;
  }

  const missStart = performance.now();
  try {
    const apiId = await resolveCanonicalArtistIdToSpotifyApiId(id);
    if (!apiId) {
      return {
        id,
        name: id,
        images: undefined,
        genres: [],
        popularity: 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }
    const artist = await getArtist(apiId);
    try {
      await upsertArtistFromSpotify(createSupabaseAdminClient(), artist);
    } catch (e) {
      console.error(`${LOG_PREFIX} upsertArtistFromSpotify error`, e);
    }
    logPerf("cache_miss", "artist", performance.now() - missStart, { id });
    return artist;
  } catch (e) {
    console.error(`${LOG_PREFIX} getArtist failed`, e);
    throw new Error(`Failed to fetch artist ${id} from Spotify`);
  }
}

export async function getOrFetchArtist(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<SpotifyApi.ArtistObjectFull> {
  const canonicalId = normalizeReviewEntityId(id);
  return timeAsync(
    "cache",
    "getOrFetchArtist",
    () => getOrFetchArtistInner(canonicalId, opts),
    { id: canonicalId },
  );
}

// --- getOrFetchArtistAlbums: fetch from Spotify, upsert albums (and artists)

export async function getOrFetchArtistAlbums(
  artistId: string,
  limit = 20,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  const supabase = await createSupabaseServerClient();
  const canonical = normalizeReviewEntityId(artistId);

  try {
    const apiId = await resolveCanonicalArtistIdToSpotifyApiId(canonical);
    if (!apiId) {
      return {
        items: [],
        total: 0,
        limit,
        offset: 0,
        next: null,
        previous: null,
      };
    }
    const res = await getArtistAlbums(apiId, limit);

    for (const a of res.items ?? []) {
      try {
        await upsertAlbumFromSpotify(supabase, a);
      } catch (e) {
        console.error(
          `${LOG_PREFIX} upsertAlbumFromSpotify failed for album ${a.id}`,
          e,
        );
      }
    }

    return res;
  } catch (e) {
    console.error(`${LOG_PREFIX} getArtistAlbums failed`, e);
    return {
      items: [],
      total: 0,
      limit,
      offset: 0,
      next: null,
      previous: null,
    };
  }
}

// --- Top tracks from logs (no Spotify dependency)

export async function getArtistTopTracksFromLogs(
  artistId: string,
  limit = 10,
): Promise<SpotifyApi.TrackObjectFull[]> {
  const supabase = await createSupabaseServerClient();

  // 1) Pull a recent window of song logs and aggregate by track_id in code
  const { data: logRows, error: logsError } = await supabase
    .from("logs")
    .select("track_id")
    .order("listened_at", { ascending: false })
    .limit(500);

  if (logsError) {
    console.error(
      `${LOG_PREFIX} getArtistTopTracksFromLogs logs select failed`,
      logsError,
    );
    return [];
  }

  const logs = (logRows as { track_id: string }[] | null) ?? [];

  if (logs.length === 0) {
    console.log(
      "[logs-top-tracks] artistId=%s returned 0 tracks (no logs)",
      artistId,
    );
    return [];
  }

  const counts = new Map<string, number>();
  for (const l of logs) {
    counts.set(l.track_id, (counts.get(l.track_id) ?? 0) + 1);
  }

  // Sort track_ids by count desc and take a bit more than limit to allow filtering
  const sortedIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, limit * 2);

  if (sortedIds.length === 0) {
    console.log(
      "[logs-top-tracks] artistId=%s returned 0 tracks (no song ids after aggregation)",
      artistId,
    );
    return [];
  }

  // 2) Try to resolve as many as possible from cached songs/albums
  const { data: songRows, error: songsError } = await supabase
    .from("tracks")
    .select("id, name, album_id, artist_id, duration_ms")
    .in("id", sortedIds);

  if (songsError) {
    console.error(
      `${LOG_PREFIX} getArtistTopTracksFromLogs songs select failed`,
      songsError,
    );
  }

  const songs =
    (songRows as
      | {
          id: string;
          name: string;
          album_id: string;
          artist_id: string;
          duration_ms: number | null;
        }[]
      | null) ?? [];

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const albumIds = [
    ...new Set(
      songs.map((s) => s.album_id).filter((id) => typeof id === "string"),
    ),
  ];

  let albumsMap = new Map<
    string,
    {
      id: string;
      name: string;
      image_url: string | null;
      release_date: string | null;
    }
  >();
  if (albumIds.length > 0) {
    const { data: albumRows, error: albumsError } = await supabase
      .from("albums")
      .select("id, name, image_url, release_date")
      .in("id", albumIds);
    if (albumsError) {
      console.error(
        `${LOG_PREFIX} getArtistTopTracksFromLogs albums select failed`,
        albumsError,
      );
    } else {
      const arr =
        (albumRows as
          | {
              id: string;
              name: string;
              image_url: string | null;
              release_date: string | null;
            }[]
          | null) ?? [];
      albumsMap = new Map(arr.map((a) => [a.id, a]));
    }
  }

  // Load artist name for display
  let artistName = "";
  const { data: artistRow } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .maybeSingle();
  if (artistRow && "name" in artistRow && artistRow.name) {
    artistName = (artistRow as { name: string }).name;
  }

  const tracks: SpotifyApi.TrackObjectFull[] = [];

  // 3) Build tracks in popularity order from local cache only (no Spotify top-tracks API)
  for (const trackId of sortedIds) {
    const song = songMap.get(trackId);
    if (!song || song.artist_id !== artistId) continue;

    const alb = albumsMap.get(song.album_id);
    const track: SpotifyApi.TrackObjectFull = {
      id: song.id,
      name: song.name,
      artists: [{ id: artistId, name: artistName }],
      duration_ms: song.duration_ms ?? undefined,
      album: alb
        ? {
            id: alb.id,
            name: alb.name,
            artists: artistName ? [{ id: artistId, name: artistName }] : [],
            images: alb.image_url ? [{ url: alb.image_url }] : undefined,
            release_date: alb.release_date ?? undefined,
          }
        : undefined,
    };
    tracks.push(track);
  }

  console.log(
    "[logs-top-tracks] artistId=%s returned %d tracks",
    artistId,
    tracks.length,
  );

  return tracks;
}

// --- getOrFetchArtistTopTracks: now uses logs only

export async function getOrFetchArtistTopTracks(
  artistId: string,
  limit = 10,
): Promise<{ tracks: SpotifyApi.TrackObjectFull[] }> {
  const tracks = await getArtistTopTracksFromLogs(artistId, limit);
  return { tracks };
}

// --- getOrFetchAlbum (lazy cache with tracks)

async function getOrFetchAlbumInner(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<{
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}> {
  const supabase = await createSupabaseServerClient();
  const net = catalogReadsAllowSpotifyNetwork(opts);
  const normalized = normalizeReviewEntityId(id);

  let dbAlbumId = normalized;
  if (isValidSpotifyId(normalized)) {
    const c = await getAlbumIdByExternalId(supabase, "spotify", normalized);
    if (c) dbAlbumId = c;
  } else if (isValidLfmCatalogId(normalized)) {
    const c = await getAlbumIdByExternalId(supabase, "lastfm", normalized);
    if (c) dbAlbumId = c;
  }

  let spotifyAlbumApiId: string | null = isValidSpotifyId(normalized)
    ? normalized
    : null;
  if (!spotifyAlbumApiId) {
    const { data: extAl } = await supabase
      .from("album_external_ids")
      .select("external_id")
      .eq("album_id", dbAlbumId)
      .eq("source", "spotify")
      .limit(1)
      .maybeSingle();
    const ex = (extAl as { external_id?: string } | null)?.external_id;
    if (ex && isValidSpotifyId(ex)) spotifyAlbumApiId = ex;
  }

  const { data: albumRow, error: albumErr } = await supabase
    .from("albums")
    .select(
      "id, name, artist_id, image_url, release_date, total_tracks, cached_at, updated_at",
    )
    .eq("id", dbAlbumId)
    .maybeSingle();

  if (albumErr) {
    console.error(`${LOG_PREFIX} albums select failed`, albumErr);
  }

  if (albumRow) {
    const album = albumRow as unknown as AlbumRow;
    const cacheTime = album.cached_at ?? album.updated_at;
    const stale = isCacheStale(cacheTime);

    if (!stale) {
      const { data: artistRow } = await supabase
        .from("artists")
        .select("id, name, image_url, genres")
        .eq("id", album.artist_id)
        .maybeSingle();
      const artist = artistRow as unknown as ArtistRow | null;

      const { data: songRows, error: songsErr } = await supabase
        .from("tracks")
        .select("id, name, album_id, artist_id, duration_ms, track_number")
        .eq("album_id", dbAlbumId)
        .order("track_number", { ascending: true });

      if (songsErr) {
        console.error(`${LOG_PREFIX} songs select failed`, songsErr);
      }

      let songs = (songRows ?? []) as unknown as SongRow[];

      if (
        net &&
        spotifyAlbumApiId &&
        albumNeedsTrackBackfill(songs.length, album.total_tracks)
      ) {
        try {
          const result = await refreshAlbumFromSpotify(
            supabase,
            spotifyAlbumApiId,
          );
          if (result?.album && result?.tracks)
            return { album: result.album, tracks: result.tracks };
          const { data: refetched } = await supabase
            .from("tracks")
            .select(
              "id, name, album_id, artist_id, duration_ms, track_number, cached_at, updated_at",
            )
            .eq("album_id", dbAlbumId)
            .order("track_number", { ascending: true });
          songs = (refetched ?? []) as unknown as SongRow[];
        } catch (e) {
          console.warn(
            `${LOG_PREFIX} album tracks backfill failed for ${dbAlbumId}`,
            e,
          );
        }
      }

      const artistIds = [...new Set(songs.map((s) => s.artist_id))];
      const { data: artistRows, error: artistsErr } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds.length ? artistIds : [album.artist_id]);

      if (artistsErr) {
        console.error(
          `${LOG_PREFIX} artists select for songs failed`,
          artistsErr,
        );
      }

      const artistMap = new Map(
        (artistRows ?? []).map((r: { id: string; name: string }) => [
          r.id,
          r.name,
        ]),
      );
      const artistName = artist?.name ?? artistMap.get(album.artist_id) ?? "";

      const albumPayload: SpotifyApi.AlbumObjectFull = {
        id: album.id,
        name: album.name,
        artists: [{ id: album.artist_id, name: artistName }],
        images: album.image_url ? [{ url: album.image_url }] : undefined,
        release_date: album.release_date ?? undefined,
        total_tracks: album.total_tracks ?? undefined,
        tracks: {
          items: songs.map<SpotifyApi.TrackObjectSimplified>((s) => ({
            id: s.id,
            name: s.name,
            artists: [
              {
                id: s.artist_id ?? "",
                name: artistMap.get(s.artist_id ?? "") ?? "",
              },
            ],
            duration_ms: s.duration_ms ?? undefined,
          })),
          total: songs.length,
          limit: songs.length,
          offset: 0,
          next: null,
          previous: null,
        },
      };

      const trackItems: SpotifyApi.TrackObjectSimplified[] = songs.map((s) => ({
        id: s.id,
        name: s.name,
        artists: [
          {
            id: s.artist_id ?? "",
            name: artistMap.get(s.artist_id ?? "") ?? "",
          },
        ],
        duration_ms: s.duration_ms ?? undefined,
      }));

      const tracksPayload: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> =
        {
          items: trackItems,
          total: songs.length,
          limit: songs.length,
          offset: 0,
          next: null,
          previous: null,
        };

      return { album: albumPayload, tracks: tracksPayload };
    }

    // Stale cache: return cached data immediately and refresh in background so the page loads fast
    const { data: artistRowStale } = await supabase
      .from("artists")
      .select("id, name, image_url, genres")
      .eq("id", album.artist_id)
      .maybeSingle();
    const artistStale = artistRowStale as unknown as ArtistRow | null;
    const { data: songRowsStale } = await supabase
      .from("tracks")
      .select("id, name, album_id, artist_id, duration_ms, track_number")
      .eq("album_id", dbAlbumId)
      .order("track_number", { ascending: true });
    let songsStale = (songRowsStale ?? []) as unknown as SongRow[];

    let ranStaleSyncBackfill = false;
    if (
      net &&
      spotifyAlbumApiId &&
      albumNeedsTrackBackfill(songsStale.length, album.total_tracks)
    ) {
      ranStaleSyncBackfill = true;
      try {
        const result = await refreshAlbumFromSpotify(
          supabase,
          spotifyAlbumApiId,
        );
        if (result?.album && result?.tracks)
          return { album: result.album, tracks: result.tracks };
        const { data: refetchedStale } = await supabase
          .from("tracks")
          .select(
            "id, name, album_id, artist_id, duration_ms, track_number, cached_at, updated_at",
          )
          .eq("album_id", dbAlbumId)
          .order("track_number", { ascending: true });
        songsStale = (refetchedStale ?? []) as unknown as SongRow[];
      } catch (e) {
        console.warn(
          `${LOG_PREFIX} album tracks backfill failed (stale album) for ${dbAlbumId}`,
          e,
        );
      }
    }

    const artistIdsStale = [
      ...new Set(songsStale.map((s) => s.artist_id).filter(Boolean)),
    ] as string[];
    const { data: artistRowsStale } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIdsStale.length ? artistIdsStale : [album.artist_id]);
    const artistMapStale = new Map(
      (artistRowsStale ?? []).map((r: { id: string; name: string }) => [
        r.id,
        r.name,
      ]),
    );
    const albumPayloadStale: SpotifyApi.AlbumObjectFull = {
      id: album.id,
      name: album.name,
      artists: [
        {
          id: album.artist_id,
          name: artistStale?.name ?? artistMapStale.get(album.artist_id) ?? "",
        },
      ],
      images: album.image_url ? [{ url: album.image_url }] : undefined,
      release_date: album.release_date ?? undefined,
      total_tracks: album.total_tracks ?? undefined,
      tracks: {
        items: songsStale.map((s) => ({
          id: s.id,
          name: s.name,
          artists: [
            {
              id: s.artist_id ?? "",
              name: artistMapStale.get(s.artist_id ?? "") ?? "",
            },
          ],
          duration_ms: s.duration_ms ?? undefined,
        })),
        total: songsStale.length,
        limit: songsStale.length,
        offset: 0,
        next: null,
        previous: null,
      },
    };
    const tracksPayloadStale: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> =
      {
        items: songsStale.map((s) => ({
          id: s.id,
          name: s.name,
          artists: [
            {
              id: s.artist_id ?? "",
              name: artistMapStale.get(s.artist_id ?? "") ?? "",
            },
          ],
          duration_ms: s.duration_ms ?? undefined,
        })),
        total: songsStale.length,
        limit: songsStale.length,
        offset: 0,
        next: null,
        previous: null,
      };
    if (!ranStaleSyncBackfill && net && spotifyAlbumApiId) {
      refreshAlbumFromSpotify(supabase, spotifyAlbumApiId).catch((e) =>
        console.warn(
          `${LOG_PREFIX} background album refresh failed for ${spotifyAlbumApiId}`,
          e,
        ),
      );
    }
    return { album: albumPayloadStale, tracks: tracksPayloadStale };
  }

  logCacheMiss("album", normalized);

  if (!net) {
    return {
      album: {
        id: spotifyAlbumApiId ?? normalized,
        name: "Album",
        artists: [{ id: "", name: "" }],
        images: [],
        release_date: undefined,
        total_tracks: 0,
        tracks: emptyTrackPaging(),
      } as SpotifyApi.AlbumObjectFull,
      tracks: emptyTrackPaging(),
    };
  }

  const missStart = performance.now();
  try {
    const apiAlbum =
      spotifyAlbumApiId ??
      (isValidSpotifyId(normalized) ? normalized : null);
    if (!apiAlbum) {
      throw new Error("No Spotify album id for catalog fetch");
    }
    const { album: albumResp, tracks: tracksResp } =
      await refreshAlbumFromSpotify(supabase, apiAlbum);
    if (!albumResp || !tracksResp) throw new Error("Refresh returned no data");
    logPerf("cache_miss", "album", performance.now() - missStart, {
      id: normalized,
    });
    return { album: albumResp, tracks: tracksResp };
  } catch (e) {
    console.error(`${LOG_PREFIX} getAlbum/getAlbumTracks failed`, e);
    throw new Error(`Failed to fetch album ${normalized} from Spotify`);
  }
}

export async function getOrFetchAlbum(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<{
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}> {
  const canonicalId = normalizeReviewEntityId(id);
  return timeAsync(
    "cache",
    "getOrFetchAlbum",
    () => getOrFetchAlbumInner(canonicalId, opts),
    {
      id: canonicalId,
    },
  );
}

/** Fetch album + tracks from Spotify and upsert (album once, each artist once, each song once). Returns the fetched data or null on error. */
async function refreshAlbumFromSpotify(
  _supabase: SupabaseClient,
  id: string,
): Promise<{
  album: SpotifyApi.AlbumObjectFull | null;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> | null;
}> {
  /** Catalog tables are RLS read-only for anon; writes require service role (see 009_spotify_entities.sql). */
  const db = createSupabaseAdminClient();
  try {
    const albumResp = await getAlbum(id, { skipCache: true });
    const tracksResp = await getAllAlbumTracks(id, { skipCache: true });
    if ((tracksResp.items ?? []).length === 0) {
      console.warn(
        `${LOG_PREFIX} Spotify returned 0 tracks for album ${id} (${albumResp.name ?? "?"})`,
      );
    }
    await upsertAlbumFromSpotify(db, albumResp);
    const albumArtistId = albumResp.artists?.[0]?.id;
    const artistIds = new Set<string>();
    for (const t of tracksResp.items ?? []) {
      const aid = t.artists?.[0]?.id;
      if (aid) artistIds.add(aid);
    }
    for (const aid of artistIds) {
      if (aid === albumArtistId) continue;
      const art = tracksResp.items?.find((tr) => tr.artists?.[0]?.id === aid)
        ?.artists?.[0];
      if (art) await upsertArtistFromSpotify(db, art);
    }
    const albumCanon =
      (await getAlbumIdByExternalId(db, "spotify", albumResp.id)) ?? null;
    if (!albumCanon) {
      console.warn(
        `${LOG_PREFIX} refreshAlbumFromSpotify: missing canonical album for ${albumResp.id}`,
      );
      return { album: albumResp, tracks: tracksResp };
    }
    for (const t of tracksResp.items ?? []) {
      const spotifyAid = t.artists?.[0]?.id ?? albumArtistId;
      if (!spotifyAid) continue;
      const artistCanon =
        (await getArtistIdByExternalId(db, "spotify", spotifyAid)) ?? null;
      if (!artistCanon) continue;
      await upsertTrackRowOnly(db, t, albumCanon, artistCanon);
    }
    return { album: albumResp, tracks: tracksResp };
  } catch (e) {
    console.error(`${LOG_PREFIX} album/track upsert error`, e);
    return { album: null, tracks: null };
  }
}

// --- getOrFetchTrack (DB-first cache + TTL)

async function getOrFetchTrackInner(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<SpotifyApi.TrackObjectFull> {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const net = catalogReadsAllowSpotifyNetwork(opts);
  const normalized = normalizeReviewEntityId(id);

  let canon = await resolveTrackCanonicalId(supabase, normalized);

  if (!canon && isValidSpotifyId(normalized) && net) {
    logCacheMiss("song", normalized);
    const missStart = performance.now();
    try {
      const track = await getTrack(normalized, {
        allowLastfmMapping: opts?.allowLastfmMapping,
      });
      const alb = track.album;
      if (!alb) throw new Error("Track has no album");
      try {
        await upsertTrackFromSpotify(
          admin,
          track,
          alb.id,
          alb.name,
          firstSpotifyImageUrl(alb.images),
          "release_date" in alb ? alb.release_date : undefined,
        );
      } catch (e) {
        console.error(`${LOG_PREFIX} upsertTrackFromSpotify error`, e);
      }
      logPerf("cache_miss", "song", performance.now() - missStart, {
        id: normalized,
      });
      return track;
    } catch (e) {
      console.error(`${LOG_PREFIX} getTrack failed`, e);
      throw new Error(`Failed to fetch track ${normalized} from Spotify`);
    }
  }

  if (!canon) {
    logCacheMiss("song", normalized);
    if (!net) {
      return {
        id: normalized,
        name: "Track",
        artists: [{ id: "", name: "Unknown" }],
      } as SpotifyApi.TrackObjectFull;
    }
    throw new Error(`Unknown track id ${normalized}`);
  }

  const { data: songRow, error } = await supabase
    .from("tracks")
    .select(
      "id, name, album_id, artist_id, duration_ms, track_number, cached_at, updated_at, lastfm_name, lastfm_artist_name",
    )
    .eq("id", canon)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} tracks select failed`, error);
  }

  if (songRow) {
    const song = songRow as unknown as SongRow;
    const lfmKey = await getLastfmExternalForTrack(supabase, song.id);
    const spotifyExt = await getSpotifyExternalForTrack(supabase, song.id);

    if (lfmKey && spotifyExt && net) {
      try {
        const t = await getTrack(spotifyExt, {
          allowLastfmMapping: opts?.allowLastfmMapping,
        });
        return withCanonicalSongId(lfmKey, t);
      } catch {
        return trackFromDbSongRow(supabase, song);
      }
    }

    if (
      lfmKey &&
      !spotifyExt &&
      catalogReadsAllowSpotifyNetwork(opts)
    ) {
      const resolved = await tryResolveLfmSongViaLastfmSearch(song, opts);
      if (resolved) return resolved;
    }

    if (lfmKey && (!song.album_id || !song.artist_id)) {
      return buildSyntheticLfmTrack(song);
    }

    const cacheTime = song.cached_at ?? song.updated_at;
    if (!isCacheStale(cacheTime)) {
      return trackFromDbSongRow(supabase, song);
    }
    if (!net) {
      return trackFromDbSongRow(supabase, song);
    }
    if (lfmKey) {
      return trackFromDbSongRow(supabase, song);
    }
  }

  logCacheMiss("song", normalized);

  if (!net) {
    return {
      id: normalized,
      name: "Track",
      artists: [{ id: "", name: "Unknown" }],
    } as SpotifyApi.TrackObjectFull;
  }

  const spotifyForRefresh =
    (songRow && (await getSpotifyExternalForTrack(supabase, canon))) ||
    (isValidSpotifyId(normalized) ? normalized : null);
  if (!spotifyForRefresh) {
    throw new Error(`Failed to fetch track ${normalized} from Spotify`);
  }

  const missStart = performance.now();
  try {
    const track = await getTrack(spotifyForRefresh, {
      allowLastfmMapping: opts?.allowLastfmMapping,
    });
    const alb = track.album;
    if (!alb) throw new Error("Track has no album");

    try {
      await upsertTrackFromSpotify(
        admin,
        track,
        alb.id,
        alb.name,
        firstSpotifyImageUrl(alb.images),
        "release_date" in alb ? alb.release_date : undefined,
      );
    } catch (e) {
      console.error(`${LOG_PREFIX} upsertTrackFromSpotify error`, e);
    }

    logPerf("cache_miss", "song", performance.now() - missStart, { id: normalized });
    return track;
  } catch (e) {
    console.error(`${LOG_PREFIX} getTrack failed`, e);
    throw new Error(`Failed to fetch track ${normalized} from Spotify`);
  }
}

export async function getOrFetchTrack(
  id: string,
  opts?: CatalogFetchOpts,
): Promise<SpotifyApi.TrackObjectFull> {
  const canonicalId = normalizeReviewEntityId(id);
  const mergedOpts: CatalogFetchOpts = {
    ...opts,
    allowNetwork: canonicalId.startsWith("lfm:")
      ? true
      : opts?.allowNetwork,
    allowLastfmMapping: canonicalId.startsWith("lfm:")
      ? true
      : opts?.allowLastfmMapping,
  };
  return timeAsync(
    "cache",
    "getOrFetchTrack",
    () => getOrFetchTrackInner(canonicalId, mergedOpts),
    { id: canonicalId },
  );
}

// --- Batch getOrFetch: DB-first, then single batch Spotify API (chunked), merge, preserve order

/** Build a Map from (ids, results) for backward-compatible Map-based call sites. */
export function batchResultsToMap<T>(
  ids: string[],
  results: (T | null)[],
): Map<string, T | null> {
  const map = new Map<string, T | null>();
  ids.forEach((id, i) => map.set(id, results[i] ?? null));
  return map;
}

/**
 * Like {@link batchResultsToMap} for track batches, but keys are
 * {@link normalizeReviewEntityId}(id). Use with {@link getTrackFromNormalizedBatchMap} so MV/RPC
 * `entity_id` matches even when encoding differs from the batch input (e.g. `lfm%3A` vs `lfm:`).
 */
export function batchTracksToNormalizedMap(
  ids: string[],
  results: (SpotifyApi.TrackObjectFull | null)[],
): Map<string, SpotifyApi.TrackObjectFull | null> {
  const map = new Map<string, SpotifyApi.TrackObjectFull | null>();
  ids.forEach((id, i) => {
    map.set(normalizeReviewEntityId(id), results[i] ?? null);
  });
  return map;
}

export function getTrackFromNormalizedBatchMap(
  map: Map<string, SpotifyApi.TrackObjectFull | null>,
  entityId: string,
): SpotifyApi.TrackObjectFull | null {
  return map.get(normalizeReviewEntityId(entityId)) ?? null;
}

function buildTrackFromRows(
  song: SongRow,
  album: AlbumRow | null,
  artistName: string,
): SpotifyApi.TrackObjectFull {
  const title =
    (song.name && song.name.trim()) ||
    (song.lastfm_name && song.lastfm_name.trim()) ||
    "Track";
  const artist =
    artistName.trim() ||
    (song.lastfm_artist_name && song.lastfm_artist_name.trim()) ||
    "Artist";
  return {
    id: song.id,
    name: title,
    artists: [{ id: song.artist_id ?? "", name: artist }],
    duration_ms: song.duration_ms ?? undefined,
    album: album
      ? {
          id: album.id,
          name: album.name,
          artists: [{ id: album.artist_id, name: artistName }],
          images: album.image_url ? [{ url: album.image_url }] : undefined,
          release_date: album.release_date ?? undefined,
        }
      : undefined,
  };
}

/**
 * `logs.track_id` / MV `entity_id` is sometimes the Spotify track id while `songs.id` is canonical
 * (`lfm:*` or another key). After building `lookup` keyed by `song.id`, copy entries so batch lookups
 * by Spotify id match.
 */
function applySpotifyIdAliasesToLookup(
  lookup: Map<string, SpotifyApi.TrackObjectFull | null>,
  spotifyToCanonical: Map<string, string>,
  uniqueIds: string[],
): void {
  for (const uid of uniqueIds) {
    if (lookup.has(uid)) continue;
    const canon = spotifyToCanonical.get(uid);
    if (canon && lookup.has(canon)) {
      lookup.set(uid, lookup.get(canon)!);
    }
  }
}

/** Batch fetch tracks: DB first, then single getTracks() for missing (chunked 50). Returns array in input order. */
async function getOrFetchTracksBatchInner(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.TrackObjectFull | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const net = catalogReadsAllowSpotifyNetwork(opts);

  const memKey = getBatchCacheKey("tracks", ids, net);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached)
    return ids.map(
      (id) => (cached.get(id) as SpotifyApi.TrackObjectFull | null) ?? null,
    );

  /** Service role: catalog reads/upserts must not use `cookies()` (e.g. inside `unstable_cache`). */
  const supabase = createSupabaseAdminClient();
  const lookup = new Map<string, SpotifyApi.TrackObjectFull | null>();

  const songSelect =
    "id, name, album_id, artist_id, duration_ms, cached_at, updated_at, lastfm_name, lastfm_artist_name";

  const allSongs: SongRow[] = [];
  const seenTrackIds = new Set<string>();
  const spotifyToCanonical = new Map<string, string>();

  for (const idChunk of chunkArray(uniqueIds, SUPABASE_IN_CHUNK)) {
    const uuidChunk = idChunk.filter((x) => isValidUuid(x));
    if (uuidChunk.length === 0) continue;
    const { data: songRows } = await supabase
      .from("tracks")
      .select(songSelect)
      .in("id", uuidChunk);
    for (const s of (songRows ?? []) as unknown as SongRow[]) {
      if (seenTrackIds.has(s.id)) continue;
      seenTrackIds.add(s.id);
      allSongs.push(s);
    }
  }

  const byPrimaryId = new Set(allSongs.map((s) => s.id));
  const spotifyLookupCandidates = uniqueIds.filter(
    (uid) => !byPrimaryId.has(uid) && isValidSpotifyId(uid),
  );
  if (spotifyLookupCandidates.length > 0) {
    for (const idChunk of chunkArray(spotifyLookupCandidates, SUPABASE_IN_CHUNK)) {
      const { data: extRows } = await supabase
        .from("track_external_ids")
        .select("track_id, external_id")
        .eq("source", "spotify")
        .in("external_id", idChunk);
      const canonIds = [
        ...new Set(
          (extRows ?? []).map((r) => (r as { track_id: string }).track_id),
        ),
      ];
      for (const row of extRows ?? []) {
        const r = row as { track_id: string; external_id: string };
        spotifyToCanonical.set(r.external_id, r.track_id);
      }
      if (canonIds.length === 0) continue;
      const { data: songRows } = await supabase
        .from("tracks")
        .select(songSelect)
        .in("id", canonIds);
      for (const s of (songRows ?? []) as unknown as SongRow[]) {
        if (seenTrackIds.has(s.id)) continue;
        seenTrackIds.add(s.id);
        allSongs.push(s);
      }
    }
  }

  const { data: extAllBatch } =
    allSongs.length > 0
      ? await supabase
          .from("track_external_ids")
          .select("track_id, external_id, source")
          .in("track_id", allSongs.map((s) => s.id))
      : { data: [] as { track_id: string; external_id: string; source: string }[] };
  const spotifyByTrackId = new Map<string, string>();
  const lfmByTrackId = new Map<string, string>();
  for (const row of extAllBatch ?? []) {
    const r = row as { track_id: string; external_id: string; source: string };
    if (r.source === "spotify") spotifyByTrackId.set(r.track_id, r.external_id);
    if (r.source === "lastfm") lfmByTrackId.set(r.track_id, r.external_id);
  }

  if (net && allSongs.length > 0) {
    for (const song of allSongs) {
      const lfm = lfmByTrackId.get(song.id);
      const sp = spotifyByTrackId.get(song.id);
      if (!lfm || !sp) continue;
      try {
        const t = await getTrack(sp, {
          allowLastfmMapping: opts?.allowLastfmMapping,
        });
        lookup.set(song.id, withCanonicalSongId(lfm, t));
      } catch (e) {
        console.warn(
          `${LOG_PREFIX} batch lfm+spotify hydrate failed`,
          song.id,
          e,
        );
      }
    }
  }

  const songs = allSongs.filter(
    (s) => !isCacheStale(s.cached_at ?? s.updated_at),
  );

  const albumIds = [...new Set(allSongs.map((s) => s.album_id).filter(Boolean))];
  const artistIds = [...new Set(allSongs.map((s) => s.artist_id).filter(Boolean))];

  const [albumRowsFlat, artistRowsFlat] = await Promise.all([
    (async () => {
      const rows: { id: string; name: string; artist_id: string; image_url: string | null; release_date: string | null; cached_at: string | null; updated_at: string | null }[] = [];
      for (const chunk of chunkArray(albumIds, SUPABASE_IN_CHUNK)) {
        const { data } = await supabase
          .from("albums")
          .select(
            "id, name, artist_id, image_url, release_date, cached_at, updated_at",
          )
          .in("id", chunk);
        rows.push(...((data ?? []) as typeof rows));
      }
      return rows;
    })(),
    (async () => {
      const rows: { id: string; name: string }[] = [];
      for (const chunk of chunkArray(artistIds, SUPABASE_IN_CHUNK)) {
        const { data } = await supabase
          .from("artists")
          .select("id, name")
          .in("id", chunk);
        rows.push(...((data ?? []) as typeof rows));
      }
      return rows;
    })(),
  ]);

  const albumMap = new Map(
    albumRowsFlat.map((a) => [a.id, a as unknown as AlbumRow]),
  );
  const artistMap = new Map(
    artistRowsFlat.map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  if (!net) {
    for (const song of allSongs) {
      if (lookup.has(song.id)) continue;
      if (
        lfmByTrackId.has(song.id) &&
        (!song.album_id || !song.artist_id)
      ) {
        lookup.set(song.id, buildSyntheticLfmTrack(song));
        continue;
      }
      const album =
        song.album_id != null ? (albumMap.get(song.album_id) ?? null) : null;
      const artistName =
        song.artist_id != null
          ? (artistMap.get(song.artist_id) ?? "")
          : (song.lastfm_artist_name ?? "");
      lookup.set(song.id, buildTrackFromRows(song, album, artistName));
    }
    applySpotifyIdAliasesToLookup(lookup, spotifyToCanonical, uniqueIds);
    uniqueIds.forEach((id) => {
      if (!lookup.has(id)) lookup.set(id, null);
    });
    setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
    return ids.map((id) => lookup.get(id) ?? null);
  }

  for (const song of songs) {
    if (lookup.has(song.id)) continue;
    if (
      lfmByTrackId.has(song.id) &&
      (!song.album_id || !song.artist_id)
    ) {
      lookup.set(song.id, buildSyntheticLfmTrack(song));
      continue;
    }
    const album =
      song.album_id != null ? (albumMap.get(song.album_id) ?? null) : null;
    const artistName =
      song.artist_id != null
        ? (artistMap.get(song.artist_id) ?? "")
        : (song.lastfm_artist_name ?? "");
    lookup.set(song.id, buildTrackFromRows(song, album, artistName));
  }

  if (net) {
    const canonicalsBySpotifyId = new Map<string, string[]>();
    for (const song of songs) {
      const t = lookup.get(song.id);
      if (!t) continue;
      if (firstSpotifyImageUrl(t.album?.images)) continue;
      const spotifyId = spotifyByTrackId.get(song.id) ?? "";
      if (!spotifyId) continue;
      const list = canonicalsBySpotifyId.get(spotifyId) ?? [];
      list.push(song.id);
      canonicalsBySpotifyId.set(spotifyId, list);
    }
    if (canonicalsBySpotifyId.size > 0) {
      try {
        const spotifyIds = [...canonicalsBySpotifyId.keys()];
        for (const idChunk of chunkArray(spotifyIds, MAX_SPOTIFY_ITEMS)) {
          const fetched = await getTracks(idChunk);
          for (let i = 0; i < idChunk.length; i++) {
            const track = fetched[i];
            if (!track) continue;
            const sid = idChunk[i];
            const canonicalIds = canonicalsBySpotifyId.get(sid) ?? [];
            const alb = track.album;
            for (const canonicalId of canonicalIds) {
              if (alb) {
                try {
                  await upsertTrackFromSpotify(
                    supabase,
                    track,
                    alb.id,
                    alb.name,
                    firstSpotifyImageUrl(alb.images),
                    "release_date" in alb ? alb.release_date : undefined,
                  );
                } catch (e) {
                  console.warn(
                    `${LOG_PREFIX} upsertTrackFromSpotify (artwork supplement) failed`,
                    canonicalId,
                    e,
                  );
                }
              }
              const lfmKey = lfmByTrackId.get(canonicalId);
              const final = lfmKey
                ? withCanonicalSongId(lfmKey, track)
                : track;
              lookup.set(canonicalId, final);
            }
          }
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} getTracks artwork supplement failed`, e);
      }
    }
  }

  // Stale rows are skipped in `songs` for Spotify refresh; still build display tracks from DB.
  for (const song of allSongs) {
    if (lookup.has(song.id)) continue;
    if (
      lfmByTrackId.has(song.id) &&
      (!song.album_id || !song.artist_id)
    ) {
      lookup.set(song.id, buildSyntheticLfmTrack(song));
      continue;
    }
    const album =
      song.album_id != null ? (albumMap.get(song.album_id) ?? null) : null;
    const artistName =
      song.artist_id != null
        ? (artistMap.get(song.artist_id) ?? "")
        : (song.lastfm_artist_name ?? "");
    lookup.set(song.id, buildTrackFromRows(song, album, artistName));
  }

  applySpotifyIdAliasesToLookup(lookup, spotifyToCanonical, uniqueIds);

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0) {
    const spotifyOnly: string[] = [];
    const nonSpotify: string[] = [];
    for (const id of missingIds) {
      if (isValidSpotifyId(id)) spotifyOnly.push(id);
      else nonSpotify.push(id);
    }

    if (spotifyOnly.length > 0) {
      try {
        for (const idChunk of chunkArray(spotifyOnly, MAX_SPOTIFY_ITEMS)) {
          const fetched = await getTracks(idChunk);
          for (const track of fetched) {
            const alb = track.album;
            if (!alb) continue;
            try {
              await upsertTrackFromSpotify(
                supabase,
                track,
                alb.id,
                alb.name,
                firstSpotifyImageUrl(alb.images),
                "release_date" in alb ? alb.release_date : undefined,
              );
            } catch (e) {
              console.warn(
                `${LOG_PREFIX} upsertTrackFromSpotify (batch) failed for ${track.id}`,
                e,
              );
            }
            lookup.set(track.id, track);
          }
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} getTracks batch failed`, e);
        spotifyOnly.forEach((id) => {
          if (!lookup.has(id)) lookup.set(id, null);
        });
      }
    }

    // `getTracks` only accepts Spotify ids. Trending MV uses `logs.track_id` (often `lfm:…` with no
    // `songs` row) — resolve those the same way as single-track fetch (Last.fm mapping, etc.).
    for (const id of nonSpotify) {
      if (lookup.has(id)) continue;
      try {
        const mergedOpts: CatalogFetchOpts = {
          ...opts,
          allowNetwork: isValidLfmCatalogId(id) ? true : opts?.allowNetwork,
          allowLastfmMapping: isValidLfmCatalogId(id)
            ? true
            : opts?.allowLastfmMapping,
        };
        const t = await getOrFetchTrackInner(id, mergedOpts);
        lookup.set(id, t);
      } catch {
        lookup.set(id, null);
      }
    }

    missingIds.forEach((id) => {
      if (!lookup.has(id)) lookup.set(id, null);
    });
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchTracksBatch(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.TrackObjectFull | null)[]> {
  const normalized = ids.map((x) => normalizeReviewEntityId(x));
  return timeAsync(
    "cache",
    "getOrFetchTracksBatch",
    () => getOrFetchTracksBatchInner(normalized, opts),
    { n: normalized.length },
  );
}

/** Batch fetch albums: DB first, then single getAlbums() for missing (chunked 20). Returns array in input order. */
async function getOrFetchAlbumsBatchInner(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.AlbumObjectSimplified | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const net = catalogReadsAllowSpotifyNetwork(opts);

  const memKey = getBatchCacheKey("albums", ids, net);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached)
    return ids.map(
      (id) =>
        (cached.get(id) as SpotifyApi.AlbumObjectSimplified | null) ?? null,
    );

  /** Service role: catalog reads/upserts must not use `cookies()` (e.g. inside `unstable_cache`). */
  const supabase = createSupabaseAdminClient();
  const lookup = new Map<string, SpotifyApi.AlbumObjectSimplified | null>();

  const allAlbums: AlbumRow[] = [];
  const seenAlbumIds = new Set<string>();
  const spotifyToCanonicalAlbum = new Map<string, string>();

  for (const idChunk of chunkArray(uniqueIds, SUPABASE_IN_CHUNK)) {
    const uuidChunk = idChunk.filter((x) => isValidUuid(x));
    if (uuidChunk.length === 0) continue;
    const { data: albumRows } = await supabase
      .from("albums")
      .select(
        "id, name, artist_id, image_url, release_date, total_tracks, cached_at, updated_at",
      )
      .in("id", uuidChunk);
    for (const a of (albumRows ?? []) as unknown as AlbumRow[]) {
      if (seenAlbumIds.has(a.id)) continue;
      seenAlbumIds.add(a.id);
      allAlbums.push(a);
    }
  }

  const byAlbumId = new Set(allAlbums.map((a) => a.id));
  const spotifyAlbumCands = uniqueIds.filter(
    (uid) => !byAlbumId.has(uid) && isValidSpotifyId(uid),
  );
  if (spotifyAlbumCands.length > 0) {
    for (const idChunk of chunkArray(spotifyAlbumCands, SUPABASE_IN_CHUNK)) {
      const { data: extRows } = await supabase
        .from("album_external_ids")
        .select("album_id, external_id")
        .eq("source", "spotify")
        .in("external_id", idChunk);
      const canonIds = [
        ...new Set(
          (extRows ?? []).map((r) => (r as { album_id: string }).album_id),
        ),
      ];
      for (const row of extRows ?? []) {
        const r = row as { album_id: string; external_id: string };
        spotifyToCanonicalAlbum.set(r.external_id, r.album_id);
      }
      if (canonIds.length === 0) continue;
      const { data: albumRows } = await supabase
        .from("albums")
        .select(
          "id, name, artist_id, image_url, release_date, total_tracks, cached_at, updated_at",
        )
        .in("id", canonIds);
      for (const a of (albumRows ?? []) as unknown as AlbumRow[]) {
        if (seenAlbumIds.has(a.id)) continue;
        seenAlbumIds.add(a.id);
        allAlbums.push(a);
      }
    }
  }
  const albums = allAlbums.filter(
    (a) => !isCacheStale(a.cached_at ?? a.updated_at),
  );

  const artistIds = [
    ...new Set(albums.map((a) => a.artist_id).filter(Boolean)),
  ];
  const artistRowsFlat: { id: string; name: string }[] = [];
  for (const chunk of chunkArray(artistIds, SUPABASE_IN_CHUNK)) {
    const { data: artistRows } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", chunk);
    artistRowsFlat.push(...((artistRows ?? []) as typeof artistRowsFlat));
  }
  const artistMap = new Map(
    artistRowsFlat.map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  const albumCanonIds = albums.map((a) => a.id);
  const { data: albExtRows } =
    albumCanonIds.length > 0
      ? await supabase
          .from("album_external_ids")
          .select("album_id, external_id")
          .eq("source", "spotify")
          .in("album_id", albumCanonIds)
      : { data: [] as { album_id: string; external_id: string }[] };
  const spotifyAlbumIdByCanon = new Map<string, string>();
  for (const r of albExtRows ?? []) {
    const row = r as { album_id: string; external_id: string };
    spotifyAlbumIdByCanon.set(row.album_id, row.external_id);
  }

  for (const album of albums) {
    const artistName = artistMap.get(album.artist_id) ?? "";
    const spotifyAlbumId =
      spotifyAlbumIdByCanon.get(album.id) ?? album.id;
    lookup.set(album.id, {
      id: spotifyAlbumId,
      name: album.name,
      artists: [{ id: album.artist_id, name: artistName }],
      images: album.image_url ? [{ url: album.image_url }] : undefined,
    });
  }

  for (const [spotifyId, canonId] of spotifyToCanonicalAlbum) {
    const v = lookup.get(canonId);
    if (v) lookup.set(spotifyId, v);
  }

  /** DB row exists but `image_url` empty — same idea as track batch artwork supplement. */
  if (net) {
    const needAlbumArtwork: string[] = [];
    const albumIdsNeedingArt = albums
      .filter((a) => !a.image_url?.trim())
      .map((a) => a.id);
    const { data: extArt } =
      albumIdsNeedingArt.length > 0
        ? await supabase
            .from("album_external_ids")
            .select("album_id, external_id")
            .eq("source", "spotify")
            .in("album_id", albumIdsNeedingArt)
        : { data: [] as { album_id: string; external_id: string }[] };
    const spotifyForAlbum = new Map<string, string>();
    for (const r of extArt ?? []) {
      const row = r as { album_id: string; external_id: string };
      spotifyForAlbum.set(row.album_id, row.external_id);
    }
    for (const album of albums) {
      if (album.image_url?.trim()) continue;
      const sid = spotifyForAlbum.get(album.id);
      if (!sid || !isValidSpotifyId(sid)) continue;
      needAlbumArtwork.push(sid);
    }
    if (needAlbumArtwork.length > 0) {
      try {
        for (const idChunk of chunkArray(needAlbumArtwork, MAX_SPOTIFY_ITEMS)) {
          const fetched = await getAlbums(idChunk);
          for (const album of fetched) {
            try {
              await upsertAlbumFromSpotify(supabase, album);
            } catch (e) {
              console.warn(
                `${LOG_PREFIX} upsertAlbumFromSpotify (artwork supplement) failed for ${album.id}`,
                e,
              );
            }
            const first = album.artists?.[0];
            lookup.set(album.id, {
              id: album.id,
              name: album.name,
              artists: first ? [{ id: first.id, name: first.name }] : [],
              images: album.images,
            });
          }
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} getAlbums artwork supplement failed`, e);
      }
    }
  }

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0 && net) {
    try {
      for (const idChunk of chunkArray(missingIds, MAX_SPOTIFY_ITEMS)) {
        const fetched = await getAlbums(idChunk);
        for (const album of fetched) {
          try {
            await upsertAlbumFromSpotify(supabase, album);
          } catch (e) {
            console.warn(
              `${LOG_PREFIX} upsertAlbumFromSpotify (batch) failed for ${album.id}`,
              e,
            );
          }
          const first = album.artists?.[0];
          lookup.set(album.id, {
            id: album.id,
            name: album.name,
            artists: first ? [{ id: first.id, name: first.name }] : [],
            images: album.images,
          });
        }
      }
      missingIds.forEach((id) => {
        if (!lookup.has(id)) lookup.set(id, null);
      });
    } catch (e) {
      console.error(`${LOG_PREFIX} getAlbums batch failed`, e);
      missingIds.forEach((id) => lookup.set(id, null));
    }
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchAlbumsBatch(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.AlbumObjectSimplified | null)[]> {
  return timeAsync(
    "cache",
    "getOrFetchAlbumsBatch",
    () => getOrFetchAlbumsBatchInner(ids, opts),
    { n: ids.length },
  );
}

/** Map Spotify catalog id → canonical artist UUID for batch alias resolution. */
function applySpotifyIdAliasesToArtistLookup(
  lookup: Map<string, SpotifyApi.ArtistObjectFull | null>,
  spotifyToCanonical: Map<string, string>,
  uniqueIds: string[],
): void {
  for (const uid of uniqueIds) {
    if (lookup.has(uid)) continue;
    const canon = spotifyToCanonical.get(uid);
    if (canon && lookup.has(canon)) {
      lookup.set(uid, lookup.get(canon)!);
    }
  }
}

/** Batch fetch artists: DB first, then resolve Spotify id + {@link getArtist} for missing. */
async function getOrFetchArtistsBatchInner(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.ArtistObjectFull | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const net = catalogReadsAllowSpotifyNetwork(opts);

  const memKey = getBatchCacheKey("artists", ids, net);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached)
    return ids.map(
      (id) => (cached.get(id) as SpotifyApi.ArtistObjectFull | null) ?? null,
    );

  /** Service role: catalog reads/upserts must not use `cookies()` (e.g. inside `unstable_cache`). */
  const supabase = createSupabaseAdminClient();
  const lookup = new Map<string, SpotifyApi.ArtistObjectFull | null>();

  const artistSelect =
    "id, name, image_url, genres, popularity, cached_at, updated_at";

  const allArtists: ArtistRow[] = [];
  const seenArtistIds = new Set<string>();
  const spotifyToCanonicalArtist = new Map<string, string>();

  for (const idChunk of chunkArray(uniqueIds, SUPABASE_IN_CHUNK)) {
    const uuidChunk = idChunk.filter((x) => isValidUuid(x));
    if (uuidChunk.length === 0) continue;
    const { data: artistRows } = await supabase
      .from("artists")
      .select(artistSelect)
      .in("id", uuidChunk);
    for (const a of (artistRows ?? []) as unknown as ArtistRow[]) {
      if (seenArtistIds.has(a.id)) continue;
      seenArtistIds.add(a.id);
      allArtists.push(a);
    }
  }

  const byPrimaryId = new Set(allArtists.map((a) => a.id));
  const spotifyLookupCandidates = uniqueIds.filter(
    (uid) => !byPrimaryId.has(uid) && isValidSpotifyId(uid),
  );
  if (spotifyLookupCandidates.length > 0) {
    for (const idChunk of chunkArray(spotifyLookupCandidates, SUPABASE_IN_CHUNK)) {
      const { data: extRows } = await supabase
        .from("artist_external_ids")
        .select("artist_id, external_id")
        .eq("source", "spotify")
        .in("external_id", idChunk);
      const canonIds = [
        ...new Set(
          (extRows ?? []).map((r) => (r as { artist_id: string }).artist_id),
        ),
      ];
      for (const row of extRows ?? []) {
        const r = row as { artist_id: string; external_id: string };
        spotifyToCanonicalArtist.set(r.external_id, r.artist_id);
      }
      if (canonIds.length === 0) continue;
      const { data: artistRows } = await supabase
        .from("artists")
        .select(artistSelect)
        .in("id", canonIds);
      for (const a of (artistRows ?? []) as unknown as ArtistRow[]) {
        if (seenArtistIds.has(a.id)) continue;
        seenArtistIds.add(a.id);
        allArtists.push(a);
      }
    }
  }

  const artistsWithImage = allArtists.filter(
    (a) => !isCacheStale(a.cached_at ?? a.updated_at) && a.image_url,
  );

  if (!net) {
    for (const a of allArtists) {
      lookup.set(a.id, {
        id: a.id,
        name: a.name,
        images: a.image_url ? [{ url: a.image_url }] : undefined,
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull);
    }
    applySpotifyIdAliasesToArtistLookup(
      lookup,
      spotifyToCanonicalArtist,
      uniqueIds,
    );
    uniqueIds.forEach((id) => {
      if (!lookup.has(id)) lookup.set(id, null);
    });
    setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
    return ids.map((id) => lookup.get(id) ?? null);
  }

  for (const a of artistsWithImage) {
    lookup.set(a.id, {
      id: a.id,
      name: a.name,
      images: [{ url: a.image_url! }],
      genres: a.genres ?? undefined,
      followers: { total: 0 },
    });
  }

  applySpotifyIdAliasesToArtistLookup(
    lookup,
    spotifyToCanonicalArtist,
    uniqueIds,
  );

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0 && net) {
    try {
      for (const id of missingIds) {
        const apiId = await resolveCanonicalArtistIdToSpotifyApiId(id);
        if (!apiId) {
          lookup.set(id, null);
          continue;
        }
        try {
          const artist = await getArtist(apiId);
          try {
            await upsertArtistFromSpotify(supabase, artist);
          } catch (e) {
            console.warn(
              `${LOG_PREFIX} upsertArtistFromSpotify (batch) failed for ${id}`,
              e,
            );
          }
          lookup.set(id, {
            ...artist,
            id: artist.id,
          } as SpotifyApi.ArtistObjectFull);
        } catch {
          lookup.set(id, null);
        }
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} getArtist (batch) failed`, e);
      missingIds.forEach((id) => {
        if (!lookup.has(id)) lookup.set(id, null);
      });
    }
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchArtistsBatch(
  ids: string[],
  opts?: CatalogFetchOpts,
): Promise<(SpotifyApi.ArtistObjectFull | null)[]> {
  return timeAsync(
    "cache",
    "getOrFetchArtistsBatch",
    () => getOrFetchArtistsBatchInner(ids, opts),
    { n: ids.length },
  );
}
