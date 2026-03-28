import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  utcMonthStart,
  utcWeekStartMonday,
  utcYear,
} from "@/lib/analytics/date-buckets";
import { resolveAlbumArtistForAggregate } from "@/lib/analytics/resolve-log-catalog-ids";

export type AggregateLogRow = {
  id: string;
  user_id: string;
  listened_at: string;
  track_id: string | null;
  album_id: string | null;
  artist_id: string | null;
  type?: string | null;
};

type AggregateDeltaKey =
  | { kind: "week"; start: string }
  | { kind: "month"; start: string }
  | { kind: "year"; year: number };

export const MAX_GENRES_PER_LOG = 3;
export const BULK_DELTA_CHUNK = 5000;
const FS = "\x1f";

function deltaKey(
  userId: string,
  entityType: "artist" | "album" | "track" | "genre",
  entityId: string,
  bucket: AggregateDeltaKey,
): string {
  const b =
    bucket.kind === "week"
      ? `w:${bucket.start}`
      : bucket.kind === "month"
        ? `m:${bucket.start}`
        : `y:${bucket.year}`;
  return [userId, entityType, entityId, b].join(FS);
}

function contribKey(
  userId: string,
  genre: string,
  bucket: AggregateDeltaKey,
  artistId: string,
): string {
  const b =
    bucket.kind === "week"
      ? `w:${bucket.start}`
      : bucket.kind === "month"
        ? `m:${bucket.start}`
        : `y:${bucket.year}`;
  return [userId, genre, b, artistId].join(FS);
}

export function parseBucket(
  part: string,
):
  | { p_week_start: string | null; p_month: string | null; p_year: number | null } {
  if (part.startsWith("w:")) {
    return { p_week_start: part.slice(2), p_month: null, p_year: null };
  }
  if (part.startsWith("m:")) {
    return { p_week_start: null, p_month: part.slice(2), p_year: null };
  }
  if (part.startsWith("y:")) {
    return {
      p_week_start: null,
      p_month: null,
      p_year: parseInt(part.slice(2), 10),
    };
  }
  throw new Error(`bad bucket ${part}`);
}

export type AggregateCatalogContext = {
  songByTrack: Map<string, { artist_id: string | null; album_id: string | null }>;
  albumById: Map<string, { artist_id: string }>;
  artistById: Map<string, { id: string; genres: string[] | null }>;
};

/**
 * Loads songs / albums / artists needed to attribute listens for aggregate deltas.
 */
export async function loadAggregateCatalogForLogs(
  admin: SupabaseClient,
  rows: AggregateLogRow[],
): Promise<AggregateCatalogContext> {
  const trackIds = [
    ...new Set(rows.map((r) => r.track_id).filter(Boolean) as string[]),
  ];
  const albumIdsFromLogs = [
    ...new Set(rows.map((r) => r.album_id).filter(Boolean) as string[]),
  ];

  const { data: songs } = trackIds.length
    ? await admin.from("songs").select("id, artist_id, album_id").in("id", trackIds)
    : { data: [] };

  const songByTrack = new Map(
    (songs ?? []).map((s) => [
      s.id,
      s as { artist_id: string | null; album_id: string | null },
    ]),
  );

  const albumIds = [
    ...new Set([
      ...albumIdsFromLogs,
      ...[...songByTrack.values()]
        .map((s) => s.album_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ]),
  ];

  const { data: albums } = albumIds.length
    ? await admin.from("albums").select("id, artist_id").in("id", albumIds)
    : { data: [] };

  const albumById = new Map(
    (albums ?? []).map((a) => [a.id, a as { artist_id: string }]),
  );

  const artistIds = new Set<string>();
  for (const r of rows) {
    if (r.track_id) {
      const s = songByTrack.get(r.track_id);
      const sa = s?.artist_id?.trim();
      if (sa) artistIds.add(sa);
    }
    if (r.album_id?.trim()) {
      const a = albumById.get(r.album_id);
      if (a?.artist_id) artistIds.add(a.artist_id);
    }
    const la = r.artist_id?.trim();
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

  return { songByTrack, albumById, artistById };
}

export function accumulateListeningAggregateDeltas(
  rows: AggregateLogRow[],
  ctx: AggregateCatalogContext,
  options: { includeTrackBumps: boolean },
): {
  deltas: Map<string, number>;
  genreContribDeltas: Map<string, number>;
  touchedGenreBuckets: Set<string>;
} {
  const { songByTrack, albumById, artistById } = ctx;
  const deltas = new Map<string, number>();
  const genreContribDeltas = new Map<string, number>();
  const touchedGenreBuckets = new Set<string>();

  function recordTouchedGenreBucket(
    userId: string,
    genre: string,
    bucket: AggregateDeltaKey,
  ) {
    const week_start = bucket.kind === "week" ? bucket.start : null;
    const month = bucket.kind === "month" ? bucket.start : null;
    const year = bucket.kind === "year" ? bucket.year : null;
    touchedGenreBuckets.add(
      JSON.stringify({
        user_id: userId,
        genre,
        week_start,
        month,
        year,
      }),
    );
  }

  function bumpGenreContributor(
    userId: string,
    genre: string,
    contributingArtistId: string,
    listenedAt: string,
    n = 1,
  ) {
    if (!contributingArtistId || !genre) return;
    const w = utcWeekStartMonday(listenedAt);
    const m = utcMonthStart(listenedAt);
    const y = utcYear(listenedAt);
    const buckets: AggregateDeltaKey[] = [
      { kind: "week", start: w },
      { kind: "month", start: m },
      { kind: "year", year: y },
    ];
    for (const b of buckets) {
      const k = contribKey(userId, genre, b, contributingArtistId);
      genreContribDeltas.set(k, (genreContribDeltas.get(k) ?? 0) + n);
      recordTouchedGenreBucket(userId, genre, b);
    }
  }

  function bump(
    userId: string,
    entityType: "artist" | "album" | "track" | "genre",
    entityId: string,
    listenedAt: string,
    n = 1,
  ) {
    if (!entityId) return;
    const w = utcWeekStartMonday(listenedAt);
    const m = utcMonthStart(listenedAt);
    const y = utcYear(listenedAt);
    const buckets: AggregateDeltaKey[] = [
      { kind: "week", start: w },
      { kind: "month", start: m },
      { kind: "year", year: y },
    ];
    for (const b of buckets) {
      const k = deltaKey(userId, entityType, entityId, b);
      deltas.set(k, (deltas.get(k) ?? 0) + n);
    }
  }

  for (const log of rows) {
    const t = log.listened_at;
    const trackId: string | null = log.track_id;
    const s = trackId ? songByTrack.get(trackId) : undefined;
    const { artistId, albumId } = resolveAlbumArtistForAggregate({
      song: s,
      logAlbumId: log.album_id,
      logArtistId: log.artist_id,
      albumArtistId: (id) => albumById.get(id)?.artist_id,
    });

    if (options.includeTrackBumps && trackId) {
      bump(log.user_id, "track", trackId, t);
    }
    if (albumId) {
      bump(log.user_id, "album", albumId, t);
    }
    if (artistId) {
      bump(log.user_id, "artist", artistId, t);
      const g = artistById.get(artistId)?.genres;
      if (g?.length) {
        for (const raw of g.slice(0, MAX_GENRES_PER_LOG)) {
          const genre = raw?.trim();
          if (genre) {
            const gnorm = genre.toLowerCase();
            bump(log.user_id, "genre", gnorm, t);
            if (artistId) {
              bumpGenreContributor(log.user_id, gnorm, artistId, t);
            }
          }
        }
      }
    }
  }

  return { deltas, genreContribDeltas, touchedGenreBuckets };
}

type BulkRow = {
  user_id: string;
  entity_type: string;
  entity_id: string;
  delta: number;
  week_start: string | null;
  month: string | null;
  year: number | null;
};

/**
 * Applies pre-built delta maps (RPC + optional genre cover refresh).
 */
export async function applyListeningAggregateDeltaMaps(
  admin: SupabaseClient,
  maps: {
    deltas: Map<string, number>;
    genreContribDeltas: Map<string, number>;
    touchedGenreBuckets: Set<string>;
  },
  log: (phase: string, detail?: Record<string, unknown>) => void,
): Promise<{ errors: number }> {
  const { deltas, genreContribDeltas, touchedGenreBuckets } = maps;
  let errors = 0;

  const bulkRows: BulkRow[] = [];
  for (const [key, delta] of deltas) {
    if (delta === 0) continue;
    const [userId, entityType, entityId, bucketPart] = key.split(FS);
    if (
      entityType !== "artist" &&
      entityType !== "album" &&
      entityType !== "track" &&
      entityType !== "genre"
    ) {
      errors++;
      continue;
    }
    const { p_week_start, p_month, p_year } = parseBucket(bucketPart);
    bulkRows.push({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      delta,
      week_start: p_week_start,
      month: p_month,
      year: p_year,
    });
  }

  log("built_deltas", {
    uniqueDeltaKeys: deltas.size,
    bulkRows: bulkRows.length,
    keyErrors: errors,
  });

  if (bulkRows.length > 0) {
    const totalChunks = Math.ceil(bulkRows.length / BULK_DELTA_CHUNK);
    log("bulk_apply_start", {
      totalChunks,
      rows: bulkRows.length,
      chunkSize: BULK_DELTA_CHUNK,
    });
    for (let i = 0; i < bulkRows.length; i += BULK_DELTA_CHUNK) {
      const chunk = bulkRows.slice(i, i + BULK_DELTA_CHUNK);
      const chunkIndex = Math.floor(i / BULK_DELTA_CHUNK) + 1;
      log("bulk_apply_chunk", {
        chunk: chunkIndex,
        totalChunks,
        rows: chunk.length,
      });
      const { error } = await admin.rpc("apply_listening_aggregate_deltas", {
        p_rows: chunk,
      });
      if (error) {
        console.warn(
          "[analytics] apply_listening_aggregate_deltas failed",
          error.message,
        );
        log("bulk_apply_failed", {
          message: error.message,
          chunk: chunkIndex,
          totalChunks,
        });
        return { errors: errors + 1 };
      }
    }
    log("bulk_apply_done");
  } else {
    log("bulk_apply_skipped", { reason: "no_aggregate_rows" });
  }

  if (genreContribDeltas.size > 0) {
    type ContribRow = {
      user_id: string;
      genre: string;
      artist_id: string;
      delta: number;
      week_start: string | null;
      month: string | null;
      year: number | null;
    };
    const contribRows: ContribRow[] = [];
    for (const [key, delta] of genreContribDeltas) {
      if (delta === 0) continue;
      const parts = key.split(FS);
      if (parts.length !== 4) continue;
      const [userId, genre, bucketPart, artistId] = parts;
      const { p_week_start, p_month, p_year } = parseBucket(bucketPart);
      contribRows.push({
        user_id: userId,
        genre,
        artist_id: artistId,
        delta,
        week_start: p_week_start,
        month: p_month,
        year: p_year,
      });
    }

    const totalContribChunks = Math.ceil(contribRows.length / BULK_DELTA_CHUNK);
    log("genre_contributors_start", {
      rows: contribRows.length,
      totalChunks: totalContribChunks,
    });
    for (let i = 0; i < contribRows.length; i += BULK_DELTA_CHUNK) {
      const chunk = contribRows.slice(i, i + BULK_DELTA_CHUNK);
      const { error: ce } = await admin.rpc("apply_genre_contributor_deltas", {
        p_rows: chunk,
      });
      if (ce) {
        console.warn(
          "[analytics] apply_genre_contributor_deltas failed",
          ce.message,
        );
        log("genre_contributors_failed", { message: ce.message });
        return { errors: errors + 1 };
      }
    }

    const touchedPayload = [...touchedGenreBuckets].map(
      (s) =>
        JSON.parse(s) as {
          user_id: string;
          genre: string;
          week_start: string | null;
          month: string | null;
          year: number | null;
        },
    );
    const { error: re } = await admin.rpc("refresh_genre_covers_for_buckets", {
      p_buckets: touchedPayload,
    });
    if (re) {
      console.warn(
        "[analytics] refresh_genre_covers_for_buckets failed",
        re.message,
      );
      log("genre_covers_refresh_failed", { message: re.message });
    } else {
      log("genre_covers_refresh_done", { buckets: touchedPayload.length });
    }
  }

  return { errors };
}
