import "server-only";

/**
 * Listening reports aggregate from the `logs` table (each row is one play/listen).
 * There is no separate `plays` table — this is the single source for report math.
 */
import { cache } from "react";

import { resolveAlbumArtistForAggregate } from "@/lib/analytics/resolve-log-catalog-ids";
import { inclusiveRangeToListenWindow } from "@/lib/analytics/listening-report-windows";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ReportEntityType } from "@/lib/analytics/listening-report-types";

const LOG_PAGE = 5000;
const MAX_RANK_ROWS = 5000;

/** Stable keys when catalog rows are missing (LEFT-join semantics). */
export const UNKNOWN_TRACK_ENTITY = "__tl_unknown_track__";
export const UNKNOWN_ALBUM_ENTITY = "__tl_unknown_album__";
export const UNKNOWN_ARTIST_ENTITY = "__tl_unknown_artist__";

export type AggregateReportRow = {
  entity_id: string;
  count: number;
  cover_image_url?: string | null;
};

export type ListeningReportBuildResult = {
  startDate: string;
  endDate: string;
  totalPlays: number;
  byEntity: Record<ReportEntityType, AggregateReportRow[]>;
};

type LogRow = {
  id: string;
  track_id: string | null;
  album_id: string | null;
  artist_id: string | null;
  listened_at: string;
};

function sortAndCap(rows: Map<string, number>): AggregateReportRow[] {
  return [...rows.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RANK_ROWS)
    .map(([entity_id, count]) => ({ entity_id, count }));
}

async function fetchLogsWindow(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
}): Promise<LogRow[]> {
  const admin = createSupabaseAdminClient();
  const out: LogRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("logs")
      .select("id, track_id, album_id, artist_id, listened_at")
      .eq("user_id", args.userId)
      .gte("listened_at", args.startIso)
      .lt("listened_at", args.endExclusiveIso)
      .order("listened_at", { ascending: true })
      .range(from, from + LOG_PAGE - 1);

    if (error) {
      console.warn("[listening-report] fetch logs", error.message);
      break;
    }
    const batch = (data ?? []) as LogRow[];
    out.push(...batch);
    if (batch.length < LOG_PAGE) break;
    from += LOG_PAGE;
  }
  return out;
}

/**
 * Single source of truth: aggregates from `logs` only (no `user_listening_aggregates`).
 * Uses application-side LEFT semantics: missing `tracks`/`albums`/`artists` rows never drop plays.
 */
async function buildListeningReportUncached(args: {
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<ListeningReportBuildResult> {
  const { startIso, endExclusiveIso } = inclusiveRangeToListenWindow({
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const logs = await fetchLogsWindow({
    userId: args.userId,
    startIso,
    endExclusiveIso,
  });

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean) as string[])];
  const albumIds = [...new Set(logs.map((l) => l.album_id).filter(Boolean) as string[])];

  const admin = createSupabaseAdminClient();
  const { data: songs } = trackIds.length
    ? await admin.from("tracks").select("id, artist_id, album_id").in("id", trackIds)
    : { data: [] };

  const songById = new Map(
    (songs ?? []).map((s) => [
      s.id,
      s as { artist_id: string | null; album_id: string | null },
    ]),
  );

  const extraAlbumIds = [
    ...new Set(
      [...songById.values()]
        .map((s) => s.album_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];
  const allAlbumIds = [...new Set([...albumIds, ...extraAlbumIds])];

  const { data: albums } = allAlbumIds.length
    ? await admin.from("albums").select("id, artist_id").in("id", allAlbumIds)
    : { data: [] };

  const albumById = new Map(
    (albums ?? []).map((a) => [a.id, a as { artist_id: string | null }]),
  );

  const artistIds = new Set<string>();
  for (const l of logs) {
    if (l.track_id) {
      const s = songById.get(l.track_id);
      const sa = s?.artist_id?.trim();
      if (sa) artistIds.add(sa);
    }
    if (l.album_id?.trim()) {
      const a = albumById.get(l.album_id);
      if (a?.artist_id) artistIds.add(a.artist_id);
    }
    const la = l.artist_id?.trim();
    if (la) artistIds.add(la);
  }

  const { data: artists } = artistIds.size
    ? await admin
        .from("artists")
        .select("id, genres")
        .in("id", [...artistIds])
    : { data: [] };

  const artistById = new Map(
    (artists ?? []).map((a) => [
      a.id,
      a as { id: string; genres: string[] | null },
    ]),
  );

  const trackCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();

  let totalPlays = 0;

  for (const log of logs) {
    totalPlays += 1;

    const trackKey = log.track_id?.trim() || UNKNOWN_TRACK_ENTITY;
    trackCounts.set(trackKey, (trackCounts.get(trackKey) ?? 0) + 1);

    const s = log.track_id ? songById.get(log.track_id) : undefined;
    const { artistId, albumId } = resolveAlbumArtistForAggregate({
      song: s,
      logAlbumId: log.album_id,
      logArtistId: log.artist_id,
      albumArtistId: (id) => albumById.get(id)?.artist_id ?? null,
    });

    const albumKey = albumId?.trim() || UNKNOWN_ALBUM_ENTITY;
    albumCounts.set(albumKey, (albumCounts.get(albumKey) ?? 0) + 1);

    const artistKey = artistId?.trim() || UNKNOWN_ARTIST_ENTITY;
    artistCounts.set(artistKey, (artistCounts.get(artistKey) ?? 0) + 1);

    if (
      artistKey !== UNKNOWN_ARTIST_ENTITY &&
      artistId &&
      artistById.has(artistId)
    ) {
      const g = artistById.get(artistId)?.genres;
      if (g?.length) {
        for (const raw of g.slice(0, 3)) {
          const genre = raw?.trim().toLowerCase();
          if (genre) {
            genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
          }
        }
      }
    }
  }

  const byEntity: ListeningReportBuildResult["byEntity"] = {
    track: sortAndCap(trackCounts),
    album: sortAndCap(albumCounts),
    artist: sortAndCap(artistCounts),
    genre: sortAndCap(genreCounts),
  };

  console.info("[listening-report] build", {
    userId: args.userId,
    startDate: args.startDate,
    endDate: args.endDate,
    playsFetched: logs.length,
    totalPlays,
    grouped: {
      tracks: byEntity.track.length,
      albums: byEntity.album.length,
      artists: byEntity.artist.length,
      genres: byEntity.genre.length,
    },
  });

  return {
    startDate: args.startDate,
    endDate: args.endDate,
    totalPlays,
    byEntity,
  };
}

/**
 * Cached per request (React cache): duplicate calls with the same args share one build.
 */
export const buildListeningReport = cache(buildListeningReportUncached);
