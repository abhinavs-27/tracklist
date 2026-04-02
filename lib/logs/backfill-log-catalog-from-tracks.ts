import "server-only";

import {
  fetchAlbumsArtistMap,
  fetchTracksMap,
  normId,
} from "@/lib/charts/aggregate-weekly-top-10";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOG = "[log-catalog-backfill]";

const PAGE = 800;
const USER_IN_CHUNK = 180;
const TRACK_NETWORK_CHUNK = 40;

export type BackfillLogCatalogFromTracksResult = {
  scanned: number;
  updated: number;
  skippedNoTrackRow: number;
  skippedNoImprovement: number;
  /** Tracks not found in DB until Spotify/network hydration. */
  networkHydratedTrackIds: number;
};

type LogRow = {
  id: string;
  track_id: string;
  album_id: string | null;
  artist_id: string | null;
};

function buildPatch(
  log: LogRow,
  song: { artist_id: string | null; album_id: string | null },
  albumArtist: (albumId: string) => string | null,
): { album_id?: string; artist_id?: string } | null {
  const patch: { album_id?: string; artist_id?: string } = {};

  const logAlbum = normId(log.album_id);
  const logArtist = normId(log.artist_id);
  const trackAlbum = normId(song.album_id);
  const trackArtist = normId(song.artist_id);

  if (!logAlbum && trackAlbum) {
    patch.album_id = trackAlbum;
  }
  if (!logArtist && trackArtist) {
    patch.artist_id = trackArtist;
  }

  const effectiveAlbum = logAlbum ?? trackAlbum;
  const albumArtistId = effectiveAlbum ? albumArtist(effectiveAlbum) : null;
  if (!normId(log.artist_id) && !patch.artist_id && albumArtistId) {
    patch.artist_id = albumArtistId;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

/**
 * Fills `logs.album_id` / `logs.artist_id` from `tracks` (+ `albums` for primary artist) when
 * missing. Passive Spotify sync and some paths write `track_id` (+ optional `album_id`) but
 * often omit `artist_id`; album/artist weekly charts then resolve poorly without this.
 *
 * Optionally hydrates missing `tracks` rows via Spotify (`getOrFetchTracksBatch`) so FKs exist.
 */
export async function backfillMissingLogCatalogFromTracks(options?: {
  startIso?: string;
  endExclusiveIso?: string;
  userIds?: string[];
  maxRows?: number;
}): Promise<BackfillLogCatalogFromTracksResult> {
  const admin = createSupabaseAdminClient();
  const maxRows = options?.maxRows ?? undefined;

  let scanned = 0;
  let updated = 0;
  let skippedNoTrackRow = 0;
  let skippedNoImprovement = 0;
  let networkHydratedTrackIds = 0;

  const timeFilter =
    options?.startIso && options?.endExclusiveIso
      ? { start: options.startIso, end: options.endExclusiveIso }
      : null;

  const userIds = options?.userIds?.filter(Boolean) ?? null;

  console.log(LOG, "start", {
    timeFilter,
    userCount: userIds?.length ?? null,
    maxRows: maxRows ?? null,
  });

  async function processBatch(rows: LogRow[]): Promise<void> {
    if (rows.length === 0) return;
    scanned += rows.length;

    const trackIds = [...new Set(rows.map((r) => normId(r.track_id)).filter(Boolean))] as string[];
    let songById = await fetchTracksMap(trackIds);

    const missingInDb = trackIds.filter((id) => !songById.has(id));
    if (missingInDb.length > 0) {
      for (let i = 0; i < missingInDb.length; i += TRACK_NETWORK_CHUNK) {
        const chunk = missingInDb.slice(i, i + TRACK_NETWORK_CHUNK);
        await getOrFetchTracksBatch(chunk, { allowNetwork: true });
      }
      networkHydratedTrackIds += missingInDb.length;
      songById = await fetchTracksMap(trackIds);
    }

    const albumIds = new Set<string>();
    for (const id of trackIds) {
      const s = songById.get(id);
      if (s?.album_id?.trim()) albumIds.add(s.album_id.trim());
    }
    for (const r of rows) {
      const la = normId(r.album_id);
      if (la) albumIds.add(la);
    }

    const albumById = await fetchAlbumsArtistMap([...albumIds]);
    const albumArtist = (albumId: string) =>
      normId(albumById.get(albumId)?.artist_id ?? null);

    for (const log of rows) {
      const tid = normId(log.track_id);
      if (!tid) {
        skippedNoTrackRow += 1;
        continue;
      }
      const song = songById.get(tid);
      if (!song) {
        skippedNoTrackRow += 1;
        console.warn(LOG, "track not in catalog after hydrate", {
          trackId: tid,
          logId: log.id,
        });
        continue;
      }

      const patch = buildPatch(log, song, albumArtist);
      if (!patch) {
        skippedNoImprovement += 1;
        continue;
      }

      const { error } = await admin.from("logs").update(patch).eq("id", log.id);
      if (error) {
        console.warn(LOG, "update failed", { logId: log.id, error: error.message });
        continue;
      }
      updated += 1;
    }
  }

  async function scanLogs(userIdFilter: string[] | null): Promise<void> {
    let lastId: string | null = null;
    for (;;) {
      if (maxRows != null && scanned >= maxRows) {
        console.log(LOG, "maxRows reached", { maxRows, scanned });
        break;
      }

      let query = admin
        .from("logs")
        .select("id, track_id, album_id, artist_id")
        .not("track_id", "is", null)
        .or("album_id.is.null,artist_id.is.null")
        .order("id", { ascending: true })
        .limit(PAGE);

      if (timeFilter) {
        query = query
          .gte("listened_at", timeFilter.start)
          .lt("listened_at", timeFilter.end);
      }
      if (userIdFilter) {
        query = query.in("user_id", userIdFilter);
      }
      if (lastId) {
        query = query.gt("id", lastId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn(LOG, "select failed", error.message);
        break;
      }
      const batch = (data ?? []) as LogRow[];
      if (batch.length === 0) break;
      lastId = batch[batch.length - 1]!.id;

      let slice = batch;
      if (maxRows != null) {
        const room = maxRows - scanned;
        if (room <= 0) break;
        if (slice.length > room) slice = slice.slice(0, room);
      }

      await processBatch(slice);
      if (batch.length < PAGE) break;
      if (maxRows != null && scanned >= maxRows) break;
    }
  }

  if (userIds && userIds.length > 0) {
    for (let u = 0; u < userIds.length; u += USER_IN_CHUNK) {
      const chunk = userIds.slice(u, u + USER_IN_CHUNK);
      await scanLogs(chunk);
    }
  } else {
    await scanLogs(null);
  }

  const result: BackfillLogCatalogFromTracksResult = {
    scanned,
    updated,
    skippedNoTrackRow,
    skippedNoImprovement,
    networkHydratedTrackIds,
  };

  console.log(LOG, "done", result);
  return result;
}
