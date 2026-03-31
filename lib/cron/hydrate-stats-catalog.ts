import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAlbumsWithFetchStats,
  getTracksWithFetchStats,
} from "@/lib/spotify";
import { getLastfmAlbumImageUrlFromAlbumInfo } from "@/lib/lastfm/get-album-info-image";
import { getLastfmAlbumImageUrlFromTrackInfo } from "@/lib/lastfm/get-track-album-image";
import { MAX_SPOTIFY_ITEMS } from "@/lib/spotify/client";
import {
  firstSpotifyImageUrl,
  upsertAlbumFromSpotify,
  upsertTrackFromSpotify,
} from "@/lib/spotify-cache";
import { linkOrphanLastfmSongsToAlbums } from "@/lib/cron/link-lfm-songs-to-albums";
import { isValidReviewEntityId, isValidSpotifyId } from "@/lib/validation";

const HYDRATE_LOG = "[cron][hydrate-stats-catalog]";

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function countMissingCovers(
  rows: { image_url: string | null }[] | null | undefined,
): number {
  return (rows ?? []).filter((r) => !r.image_url?.trim()).length;
}

export type HydrateStatsCatalogResult = {
  /** Spotify-format album IDs from `album_stats` (highest `listen_count` first, capped). */
  albumIdsAttempted: number;
  albumBatches: number;
  albumsUpserted: number;
  /** Successful GET /albums/{id} responses (≤ attempted; gap = fetch failures). */
  albumsSpotifyFetched: number;
  /** GET /albums/{id} that threw (invalid id, 404, rate limit, etc.); see `getAlbumsWithFetchStats`. */
  albumsSpotifyFetchFailures: number;
  /** Spotify-format track IDs from `track_stats` (highest `listen_count` first, capped). */
  trackIdsAttempted: number;
  /** Tracks skipped: song + album already had cover (no `GET /tracks/{id}`). */
  tracksSkippedAlreadyHadCover: number;
  trackBatches: number;
  tracksUpserted: number;
  /** Successful GET /tracks/{id} responses (≤ Spotify work queue; gap = fetch failures). */
  tracksSpotifyFetched: number;
  /** GET /tracks/{id} that threw; see `getTracksWithFetchStats`. */
  tracksSpotifyFetchFailures: number;
  /** Album rows got `image_url` from Last.fm after Spotify missing/failed (requires `LASTFM_API_KEY`). */
  albumCoversFilledFromLastfm: number;
  /** `track_stats` rows whose `track_id` is not a valid catalog song id (neither Spotify nor `lfm:…`). */
  skippedNonSpotifyTrackIds: number;
  albumErrors: string[];
  trackErrors: string[];
  /** Among attempted albums, rows still missing `image_url` after upserts (should trend to 0). */
  albumsMissingCoverAfter: number;
  /** Among albums linked from attempted tracks, rows still missing cover (should trend to 0). */
  albumsMissingCoverForTrackScopeAfter: number;
  /** `spotify` = normal; `lastfm_only` when `SPOTIFY_REFRESH_DISABLED=true` (refresh-stats only). */
  hydrationMode: "spotify" | "lastfm_only";
  /** Song ids from `get_trending_entities_from_mv` merged into the track hydrate queue (before stats fill). */
  trendingSongIdsFromMv: number;
  /** Pending `lfm:*` songs that got `album_id` + `artist_id` from Last.fm metadata this run. */
  lfmOrphanSongsLinked: number;
};

type AlbumCoverContext = {
  artistName: string;
  trackName?: string;
  albumName?: string;
};

type SongRow = {
  id: string;
  name: string | null;
  lastfm_name?: string | null;
  lastfm_artist_name?: string | null;
  album_id: string;
  artist_id: string;
};

type AlbumRow = { id: string; name: string | null; image_url: string | null };
type ArtistRow = { id: string; name: string | null };

function isSpotifyRefreshDisabled(): boolean {
  return process.env.SPOTIFY_REFRESH_DISABLED === "true";
}

/** Trending discover rows (songs) — same MV as the Discover page. */
async function fetchTrendingSongIds(
  admin: SupabaseClient,
  limit: number,
): Promise<string[]> {
  try {
    const { data, error } = await admin.rpc("get_trending_entities_from_mv", {
      p_limit: limit,
    });
    if (error || !data?.length) return [];
    return (data as { entity_id: string; entity_type?: string }[])
      .filter((r) => (r.entity_type ?? "song") === "song")
      .map((r) => r.entity_id);
  } catch {
    return [];
  }
}

/**
 * Prefer MV trending ids so Discover artwork is hydrated even when not in top `track_stats`.
 * Includes `lfm:…` song ids (same as `logs.track_id` / MV) — not only Spotify 22-char ids.
 */
function mergeTrackIdsPreferTrending(
  trending: string[],
  statsOrdered: string[],
  maxTotal: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of trending) {
    if (!isValidReviewEntityId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxTotal) return out;
  }
  for (const id of statsOrdered) {
    if (!isValidReviewEntityId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxTotal) return out;
  }
  return out;
}

async function buildAlbumCoverContextFromTrackIds(
  admin: SupabaseClient,
  trackIds: string[],
  trackErrors: string[],
): Promise<{
  tracksSkippedAlreadyHadCover: number;
  albumContextByAlbumId: Map<string, AlbumCoverContext>;
  spotifyTrackIdsToFetch: string[];
}> {
  const spotifyTrackIdsToFetch: string[] = [];
  const albumContextByAlbumId = new Map<string, AlbumCoverContext>();
  let tracksSkippedAlreadyHadCover = 0;

  if (trackIds.length === 0) {
    return {
      tracksSkippedAlreadyHadCover: 0,
      albumContextByAlbumId,
      spotifyTrackIdsToFetch,
    };
  }

  const { data: songRowsRaw, error: songsErr } = await admin
    .from("tracks")
    .select(
      "id, name, lastfm_name, lastfm_artist_name, album_id, artist_id",
    )
    .in("id", trackIds);

  if (songsErr) {
    trackErrors.push(`songs read: ${songsErr.message}`);
  }

  const songsById = new Map<string, SongRow>();
  for (const r of (songRowsRaw ?? []) as SongRow[]) {
    songsById.set(r.id, r);
  }

  const albumIdsNeeded = [
    ...new Set(
      [...songsById.values()].map((s) => s.album_id).filter(Boolean),
    ),
  ];
  const artistIdsNeeded = [
    ...new Set(
      [...songsById.values()].map((s) => s.artist_id).filter(Boolean),
    ),
  ];

  const albumMap = new Map<string, AlbumRow>();
  if (albumIdsNeeded.length > 0) {
    const { data: albRows, error: albErr } = await admin
      .from("albums")
      .select("id, name, image_url")
      .in("id", albumIdsNeeded);
    if (albErr) {
      trackErrors.push(`albums read: ${albErr.message}`);
    }
    for (const a of (albRows ?? []) as AlbumRow[]) {
      albumMap.set(a.id, a);
    }
  }

  const artistMap = new Map<string, ArtistRow>();
  if (artistIdsNeeded.length > 0) {
    const { data: arRows, error: arErr } = await admin
      .from("artists")
      .select("id, name")
      .in("id", artistIdsNeeded);
    if (arErr) {
      trackErrors.push(`artists read: ${arErr.message}`);
    }
    for (const a of (arRows ?? []) as ArtistRow[]) {
      artistMap.set(a.id, a);
    }
  }

  for (const tid of trackIds) {
    const song = songsById.get(tid);
    if (!song) {
      if (isValidSpotifyId(tid)) spotifyTrackIdsToFetch.push(tid);
      continue;
    }
    const alb = albumMap.get(song.album_id);
    const hasCover = Boolean(alb?.image_url?.trim());
    if (hasCover) {
      tracksSkippedAlreadyHadCover += 1;
      continue;
    }
    if (isValidSpotifyId(tid)) {
      spotifyTrackIdsToFetch.push(tid);
    }

    const artistName =
      artistMap.get(song.artist_id)?.name?.trim() ||
      song.lastfm_artist_name?.trim() ||
      "";
    const trackName =
      song.name?.trim() || song.lastfm_name?.trim() || "";
    const albumName = alb?.name?.trim() ?? "";
    if (
      artistName &&
      (trackName || albumName) &&
      !albumContextByAlbumId.has(song.album_id)
    ) {
      albumContextByAlbumId.set(song.album_id, {
        artistName,
        ...(trackName ? { trackName } : {}),
        ...(albumName ? { albumName } : {}),
      });
    }
  }

  return {
    tracksSkippedAlreadyHadCover,
    albumContextByAlbumId,
    spotifyTrackIdsToFetch,
  };
}

async function enrichAlbumContextFromAlbumStats(
  admin: SupabaseClient,
  albumIds: string[],
  albumContextByAlbumId: Map<string, AlbumCoverContext>,
  trackErrors: string[],
): Promise<void> {
  if (albumIds.length === 0) return;

  const { data: rows, error } = await admin
    .from("albums")
    .select("id, name, image_url, artist_id")
    .in("id", albumIds);

  if (error) {
    trackErrors.push(`albums (stats enrich): ${error.message}`);
    return;
  }

  const artistIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => (r as { artist_id: string }).artist_id)
        .filter(Boolean),
    ),
  ];
  const { data: artists } = await admin
    .from("artists")
    .select("id, name")
    .in("id", artistIds);
  const artistMap = new Map(
    (artists ?? []).map((a) => [a.id, String(a.name ?? "").trim()]),
  );

  for (const r of rows ?? []) {
    const row = r as {
      id: string;
      name: string | null;
      image_url: string | null;
      artist_id: string;
    };
    if (row.image_url?.trim()) continue;
    if (albumContextByAlbumId.has(row.id)) continue;
    const an = artistMap.get(row.artist_id) ?? "";
    const albumName = row.name?.trim() ?? "";
    if (an && albumName) {
      albumContextByAlbumId.set(row.id, {
        artistName: an,
        albumName,
      });
    }
  }
}

async function fillAlbumCoversFromLastfm(
  admin: SupabaseClient,
  albumContextByAlbumId: Map<string, AlbumCoverContext>,
  trackErrors: string[],
): Promise<number> {
  if (albumContextByAlbumId.size === 0) return 0;

  const albumIds = [...albumContextByAlbumId.keys()];
  const { data: coverRows, error: coverErr } = await admin
    .from("albums")
    .select("id, image_url")
    .in("id", albumIds);

  if (coverErr) {
    trackErrors.push(`albums cover read (lastfm pass): ${coverErr.message}`);
    return 0;
  }

  let albumCoversFilledFromLastfm = 0;
  const now = new Date().toISOString();

  for (const row of coverRows ?? []) {
    const id = (row as { id: string; image_url: string | null }).id;
    if ((row as { image_url: string | null }).image_url?.trim()) {
      continue;
    }
    const ctx = albumContextByAlbumId.get(id);
    if (!ctx) continue;

    let url: string | null = null;
    if (ctx.trackName?.trim()) {
      url = await getLastfmAlbumImageUrlFromTrackInfo(
        ctx.artistName,
        ctx.trackName,
      );
    }
    if (!url && ctx.albumName?.trim()) {
      url = await getLastfmAlbumImageUrlFromAlbumInfo(
        ctx.artistName,
        ctx.albumName,
      );
    }
    if (!url) continue;

    const { error: upErr } = await admin
      .from("albums")
      .update({ image_url: url, updated_at: now })
      .eq("id", id);

    if (upErr) {
      trackErrors.push(`lastfm album image ${id}: ${upErr.message}`);
    } else {
      albumCoversFilledFromLastfm += 1;
    }
  }

  return albumCoversFilledFromLastfm;
}

async function hydrateStatsCatalogLastFmOnly(
  admin: SupabaseClient,
  args: {
    albumIds: string[];
    mergedTrackIds: string[];
    skippedNonSpotifyTrackIds: number;
    trendingSongIdsFromMv: number;
    hydrateStarted: number;
    lfmOrphanSongsLinked: number;
    albumErrors: string[];
    trackErrors: string[];
  },
): Promise<HydrateStatsCatalogResult> {
  const {
    albumIds,
    mergedTrackIds,
    skippedNonSpotifyTrackIds,
    trendingSongIdsFromMv,
    hydrateStarted,
    lfmOrphanSongsLinked,
    albumErrors,
    trackErrors,
  } = args;

  console.log(HYDRATE_LOG, "mode_lastfm_only", {
    albumIds: albumIds.length,
    mergedTrackIds: mergedTrackIds.length,
    trendingSongIdsFromMv,
  });

  const built = await buildAlbumCoverContextFromTrackIds(
    admin,
    mergedTrackIds,
    trackErrors,
  );

  await enrichAlbumContextFromAlbumStats(
    admin,
    albumIds,
    built.albumContextByAlbumId,
    trackErrors,
  );

  const albumCoversFilledFromLastfm = await fillAlbumCoversFromLastfm(
    admin,
    built.albumContextByAlbumId,
    trackErrors,
  );

  let albumsMissingCoverAfter = 0;
  if (albumIds.length > 0) {
    const { data: albumRows } = await admin
      .from("albums")
      .select("image_url")
      .in("id", albumIds);
    albumsMissingCoverAfter = countMissingCovers(albumRows);
  }

  let albumsMissingCoverForTrackScopeAfter = 0;
  if (mergedTrackIds.length > 0) {
    const { data: songRows } = await admin
      .from("tracks")
      .select("album_id")
      .in("id", mergedTrackIds);
    const albumIdsFromSongs = [
      ...new Set(
        (songRows ?? []).map((s) => s.album_id).filter(Boolean) as string[],
      ),
    ];
    if (albumIdsFromSongs.length > 0) {
      const { data: albRows } = await admin
        .from("albums")
        .select("image_url")
        .in("id", albumIdsFromSongs);
      albumsMissingCoverForTrackScopeAfter = countMissingCovers(albRows);
    }
  }

  const totalMs = Date.now() - hydrateStarted;
  console.log(HYDRATE_LOG, "complete", {
    totalMs,
    mode: "lastfm_only",
    albumCoversFilledFromLastfm,
    lfmOrphanSongsLinked,
    tracksSkippedAlreadyHadCover: built.tracksSkippedAlreadyHadCover,
  });

  return {
    albumIdsAttempted: albumIds.length,
    albumBatches: 0,
    albumsUpserted: 0,
    albumsSpotifyFetched: 0,
    albumsSpotifyFetchFailures: 0,
    trackIdsAttempted: mergedTrackIds.length,
    tracksSkippedAlreadyHadCover: built.tracksSkippedAlreadyHadCover,
    trackBatches: 0,
    tracksUpserted: 0,
    tracksSpotifyFetched: 0,
    tracksSpotifyFetchFailures: 0,
    albumCoversFilledFromLastfm,
    skippedNonSpotifyTrackIds,
    albumErrors: albumErrors.slice(0, 40),
    trackErrors: trackErrors.slice(0, 40),
    albumsMissingCoverAfter,
    albumsMissingCoverForTrackScopeAfter,
    hydrationMode: "lastfm_only",
    trendingSongIdsFromMv,
    lfmOrphanSongsLinked,
  };
}

/**
 * Pull fresh Spotify metadata (names, artwork, release dates) for catalog rows tied to stats.
 * Uses the **admin** client so upserts succeed under RLS (service role).
 *
 * Run after `refresh_entity_stats` so the same entity universe is covered. Caps avoid cron timeouts;
 * highest-listen entities are refreshed first.
 *
 * **Tracks:** skips `GET /tracks/{id}` when the DB already has a song row and the album has cover art
 * (saves quota). Single-track Spotify calls use a dedicated stricter limiter in `@tracklist/spotify-client`.
 * If Spotify does not return artwork or the track fetch fails, we try **Last.fm** `track.getInfo` album
 * images (Spotify first, Last.fm fills gaps).
 */
export async function hydrateStatsCatalogFromSpotify(
  admin: SupabaseClient,
  opts: {
    maxAlbums?: number;
    maxTracks?: number;
  } = {},
): Promise<HydrateStatsCatalogResult> {
  const hydrateStarted = Date.now();
  const maxAlbums = Math.min(Math.max(1, opts.maxAlbums ?? 500), 5000);
  const maxTracks = Math.min(Math.max(1, opts.maxTracks ?? 200), 5000);

  console.log(HYDRATE_LOG, "start", {
    maxAlbums,
    maxTracks,
    note: "GET /tracks/{id} uses a dedicated stricter limiter; skips tracks that already have album art in DB",
  });

  const albumErrors: string[] = [];
  const trackErrors: string[] = [];
  let albumsUpserted = 0;
  let tracksUpserted = 0;
  let albumsSpotifyFetched = 0;
  let albumsSpotifyFetchFailures = 0;
  let tracksSpotifyFetched = 0;
  let tracksSpotifyFetchFailures = 0;
  let tracksSkippedAlreadyHadCover = 0;
  let albumCoversFilledFromLastfm = 0;

  const { data: albumStatRows, error: albumStatErr } = await admin
    .from("album_stats")
    .select("album_id, listen_count")
    .order("listen_count", { ascending: false })
    .limit(3000);

  if (albumStatErr) {
    albumErrors.push(`album_stats read: ${albumStatErr.message}`);
  }

  const albumIds = [
    ...new Set((albumStatRows ?? []).map((r) => r.album_id as string)),
  ]
    .filter((id) => isValidSpotifyId(id))
    .slice(0, maxAlbums);

  const { data: trackStatRows, error: trackStatErr } = await admin
    .from("track_stats")
    .select("track_id, listen_count")
    .order("listen_count", { ascending: false })
    .limit(3000);

  if (trackStatErr) {
    trackErrors.push(`track_stats read: ${trackStatErr.message}`);
  }

  const orderedStatTrackIds: string[] = [];
  const seenTrack = new Set<string>();
  for (const row of trackStatRows ?? []) {
    const id = row.track_id as string;
    if (!isValidReviewEntityId(id)) continue;
    if (seenTrack.has(id)) continue;
    seenTrack.add(id);
    orderedStatTrackIds.push(id);
  }

  /** Rows whose `track_id` is not a usable song entity id (not Spotify or `lfm:`). */
  const skippedNonSpotifyTrackIds = (trackStatRows ?? []).filter(
    (r) => !isValidReviewEntityId(r.track_id as string),
  ).length;

  const trendingSongIds = await fetchTrendingSongIds(admin, 100);
  const mergeCap = Math.min(500, Math.max(maxTracks, trendingSongIds.length + 80));
  const mergedTrackIds = mergeTrackIdsPreferTrending(
    trendingSongIds,
    orderedStatTrackIds,
    mergeCap,
  );

  let lfmOrphanSongsLinked = 0;
  if (mergedTrackIds.length > 0) {
    const linkResult = await linkOrphanLastfmSongsToAlbums(
      admin,
      mergedTrackIds,
      trackErrors,
    );
    lfmOrphanSongsLinked = linkResult.linked;
  }

  if (isSpotifyRefreshDisabled()) {
    return hydrateStatsCatalogLastFmOnly(admin, {
      albumIds,
      mergedTrackIds,
      skippedNonSpotifyTrackIds,
      trendingSongIdsFromMv: trendingSongIds.length,
      hydrateStarted,
      lfmOrphanSongsLinked,
      albumErrors,
      trackErrors,
    });
  }

  console.log(HYDRATE_LOG, "ids_ready", {
    albumIdsToFetch: albumIds.length,
    mergedTrackIds: mergedTrackIds.length,
    trendingSongIdsFromMv: trendingSongIds.length,
    lfmOrphanSongsLinked,
    maxTracks,
    skippedNonSpotifyTrackIds,
    albumBatches: Math.ceil(albumIds.length / MAX_SPOTIFY_ITEMS) || 0,
    chunkSize: MAX_SPOTIFY_ITEMS,
  });

  const albumChunks = chunk(albumIds, MAX_SPOTIFY_ITEMS);
  for (let i = 0; i < albumChunks.length; i++) {
    const idChunk = albumChunks[i]!;
    const batchLabel = `${i + 1}/${albumChunks.length}`;
    const batchStart = Date.now();
    console.log(HYDRATE_LOG, "album_batch_start", {
      batch: batchLabel,
      idsInBatch: idChunk.length,
    });
    try {
      const {
        albums: fetched,
        fetchFailures: batchFetchFailures,
      } = await getAlbumsWithFetchStats(idChunk);
      albumsSpotifyFetched += fetched.length;
      albumsSpotifyFetchFailures += batchFetchFailures;
      let batchUpserts = 0;
      for (const album of fetched) {
        try {
          await upsertAlbumFromSpotify(admin, album);
          albumsUpserted += 1;
          batchUpserts += 1;
        } catch (e) {
          albumErrors.push(
            `${album.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      console.log(HYDRATE_LOG, "album_batch_done", {
        batch: batchLabel,
        ms: Date.now() - batchStart,
        spotifyReturned: fetched.length,
        spotifyFetchFailures: batchFetchFailures,
        upsertsOk: batchUpserts,
      });
    } catch (e) {
      albumErrors.push(
        `album batch: ${e instanceof Error ? e.message : String(e)}`,
      );
      console.error(HYDRATE_LOG, "album_batch_failed", {
        batch: batchLabel,
        ms: Date.now() - batchStart,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const built = await buildAlbumCoverContextFromTrackIds(
    admin,
    mergedTrackIds,
    trackErrors,
  );
  tracksSkippedAlreadyHadCover = built.tracksSkippedAlreadyHadCover;
  const spotifyTrackIdsToFetch = built.spotifyTrackIdsToFetch;
  const albumContextByAlbumId = built.albumContextByAlbumId;

  const trackChunks = chunk(spotifyTrackIdsToFetch, MAX_SPOTIFY_ITEMS);
  console.log(HYDRATE_LOG, "track_queue", {
    mergedTrackIds: mergedTrackIds.length,
    spotifyTrackIdsToFetch: spotifyTrackIdsToFetch.length,
    tracksSkippedAlreadyHadCover,
    trackBatches: trackChunks.length,
    chunkSize: MAX_SPOTIFY_ITEMS,
  });

  for (let i = 0; i < trackChunks.length; i++) {
    const idChunk = trackChunks[i]!;
    const batchLabel = `${i + 1}/${trackChunks.length}`;
    const batchStart = Date.now();
    console.log(HYDRATE_LOG, "track_batch_start", {
      batch: batchLabel,
      idsInBatch: idChunk.length,
    });
    try {
      const {
        tracks: fetched,
        fetchFailures: batchFetchFailures,
      } = await getTracksWithFetchStats(idChunk);
      tracksSpotifyFetched += fetched.length;
      tracksSpotifyFetchFailures += batchFetchFailures;
      let batchUpserts = 0;
      for (const track of fetched) {
        const alb = track.album;
        if (!alb) {
          trackErrors.push(`${track.id}: Spotify returned no album`);
          continue;
        }
        try {
          await upsertTrackFromSpotify(
            admin,
            track,
            alb.id,
            alb.name,
            firstSpotifyImageUrl(alb.images),
            "release_date" in alb ? alb.release_date : undefined,
          );
          tracksUpserted += 1;
          batchUpserts += 1;
          const artist = track.artists?.[0];
          const tn = track.name?.trim() ?? "";
          const an = artist?.name?.trim() ?? "";
          if (tn && an && !albumContextByAlbumId.has(alb.id)) {
            albumContextByAlbumId.set(alb.id, {
              artistName: an,
              trackName: tn,
              albumName: alb.name?.trim() || undefined,
            });
          }
        } catch (e) {
          trackErrors.push(
            `${track.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      console.log(HYDRATE_LOG, "track_batch_done", {
        batch: batchLabel,
        ms: Date.now() - batchStart,
        spotifyReturned: fetched.length,
        spotifyFetchFailures: batchFetchFailures,
        upsertsOk: batchUpserts,
      });
    } catch (e) {
      trackErrors.push(
        `track batch: ${e instanceof Error ? e.message : String(e)}`,
      );
      console.error(HYDRATE_LOG, "track_batch_failed", {
        batch: batchLabel,
        ms: Date.now() - batchStart,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await enrichAlbumContextFromAlbumStats(
    admin,
    albumIds,
    albumContextByAlbumId,
    trackErrors,
  );

  console.log(HYDRATE_LOG, "lastfm_album_cover_pass", {
    albumCandidates: albumContextByAlbumId.size,
  });

  albumCoversFilledFromLastfm = await fillAlbumCoversFromLastfm(
    admin,
    albumContextByAlbumId,
    trackErrors,
  );

  console.log(HYDRATE_LOG, "verify_db_counts");

  let albumsMissingCoverAfter = 0;
  if (albumIds.length > 0) {
    const { data: albumRows } = await admin
      .from("albums")
      .select("image_url")
      .in("id", albumIds);
    albumsMissingCoverAfter = countMissingCovers(albumRows);
  }

  let albumsMissingCoverForTrackScopeAfter = 0;
  if (mergedTrackIds.length > 0) {
    const { data: songRows } = await admin
      .from("tracks")
      .select("album_id")
      .in("id", mergedTrackIds);
    const albumIdsFromSongs = [
      ...new Set(
        (songRows ?? []).map((s) => s.album_id).filter(Boolean) as string[],
      ),
    ];
    if (albumIdsFromSongs.length > 0) {
      const { data: albRows } = await admin
        .from("albums")
        .select("image_url")
        .in("id", albumIdsFromSongs);
      albumsMissingCoverForTrackScopeAfter = countMissingCovers(albRows);
    }
  }

  const totalMs = Date.now() - hydrateStarted;
  console.log(HYDRATE_LOG, "complete", {
    totalMs,
    albumsUpserted,
    albumsSpotifyFetched,
    albumsSpotifyFetchFailures,
    tracksUpserted,
    tracksSkippedAlreadyHadCover,
    tracksSpotifyFetched,
    tracksSpotifyFetchFailures,
    albumCoversFilledFromLastfm,
    lfmOrphanSongsLinked,
    albumErrorsN: albumErrors.length,
    trackErrorsN: trackErrors.length,
  });

  return {
    albumIdsAttempted: albumIds.length,
    albumBatches: Math.ceil(albumIds.length / MAX_SPOTIFY_ITEMS) || 0,
    albumsUpserted,
    albumsSpotifyFetched,
    albumsSpotifyFetchFailures,
    trackIdsAttempted: mergedTrackIds.length,
    tracksSkippedAlreadyHadCover,
    trackBatches: Math.ceil(spotifyTrackIdsToFetch.length / MAX_SPOTIFY_ITEMS) || 0,
    tracksUpserted,
    tracksSpotifyFetched,
    tracksSpotifyFetchFailures,
    albumCoversFilledFromLastfm,
    skippedNonSpotifyTrackIds,
    albumErrors: albumErrors.slice(0, 40),
    trackErrors: trackErrors.slice(0, 40),
    albumsMissingCoverAfter,
    albumsMissingCoverForTrackScopeAfter,
    hydrationMode: "spotify",
    trendingSongIdsFromMv: trendingSongIds.length,
    lfmOrphanSongsLinked,
  };
}
