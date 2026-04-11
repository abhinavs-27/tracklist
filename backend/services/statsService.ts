import {
  resolveCanonicalAlbumUuidFromEntityId,
  resolveCanonicalTrackUuidFromEntityId,
} from "../lib/catalogEntityResolution";
import { getSupabase } from "../lib/supabase";
import {
  defaultRatingDistribution,
  normalizeRatingDistribution,
  ratingDistributionKey,
} from "@/lib/ratings";

const LOG_COUNT_CHUNK = 400;

/** One GROUP BY query per chunk; falls back to getTrackStatsForTrackIds if RPC missing. */
async function countLogsByTrackIds(
  supabase: ReturnType<typeof getSupabase>,
  trackIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(trackIds)];
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += LOG_COUNT_CHUNK) {
    const slice = unique.slice(i, i + LOG_COUNT_CHUNK);
    const { data, error } = await supabase.rpc("count_logs_by_track_ids", {
      p_track_ids: slice,
    });
    if (error || data == null) {
      const stats = await getTrackStatsForTrackIds(slice);
      for (const id of slice) {
        map.set(id, stats[id]?.listen_count ?? 0);
      }
      continue;
    }
    for (const row of data as { track_id: string; play_count: number | string }[]) {
      map.set(row.track_id, Number(row.play_count));
    }
  }

  for (const id of unique) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Entity stats (listen count + rating aggregation)
// ---------------------------------------------------------------------------

export type EntityStats = {
  listen_count: number;
  average_rating: number | null;
  review_count: number;
  /** Count per half-star step; string keys "1" … "5" (JSONB). */
  rating_distribution?: Record<string, number>;
};

const DEFAULT_ENTITY_STATS: EntityStats = {
  listen_count: 0,
  average_rating: null,
  review_count: 0,
  rating_distribution: defaultRatingDistribution(),
};

function mapAlbumStatsRow(row: {
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
  rating_distribution: unknown;
}): EntityStats {
  const rating_distribution = normalizeRatingDistribution(
    row.rating_distribution,
  );
  return {
    listen_count: row.listen_count ?? 0,
    average_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
    review_count: row.review_count ?? 0,
    rating_distribution,
  };
}

function mapTrackStatsRow(row: {
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
}): EntityStats {
  return {
    listen_count: row.listen_count ?? 0,
    average_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
    review_count: row.review_count ?? 0,
  };
}

/** Aggregates from reviews + logs (used when precomputed stats are missing). */
async function getEntityStatsLive(
  entityType: "album" | "song",
  /** Canonical album or track UUID. */
  canonicalEntityId: string,
): Promise<EntityStats> {
  const supabase = getSupabase();

  let listen_count = 0;
  if (entityType === "song") {
    const { data, error } = await supabase.rpc("count_logs_by_track_ids", {
      p_track_ids: [canonicalEntityId],
    });
    if (!error && data?.length) {
      listen_count = Number(data[0].play_count) || 0;
    } else {
      const { count } = await supabase
        .from("logs")
        .select("id", { count: "exact", head: true })
        .eq("track_id", canonicalEntityId)
        .limit(1);
      listen_count = count ?? 0;
    }
  } else {
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalEntityId)
      .limit(2000);
    if (tracks?.length) {
      const ids = tracks.map((t) => t.id);
      const playMap = await countLogsByTrackIds(supabase, ids);
      listen_count = Array.from(playMap.values()).reduce((a, b) => a + b, 0);
    }
  }

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("rating")
    .eq("entity_type", entityType)
    .eq("entity_id", canonicalEntityId)
    .limit(5000);

  const ratings = (reviewRows ?? []).map((r) => r.rating);
  const review_count = ratings.length;
  const sum = ratings.reduce((a, b) => a + b, 0);
  const average_rating =
    review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;

  const rating_distribution = defaultRatingDistribution();
  for (const r of ratings) {
    const key = ratingDistributionKey(Number(r));
    if (key in rating_distribution) {
      rating_distribution[key]++;
    }
  }

  return { listen_count, average_rating, review_count, rating_distribution };
}

// In-memory cache for entity stats (hot album/track pages). TTL 10 min.
const ENTITY_STATS_TTL_MS = 10 * 60 * 1000;
const entityStatsMemoryCache = new Map<
  string,
  { data: EntityStats; expiresAt: number }
>();

function getEntityStatsFromMemory(
  entityType: "album" | "song",
  entityId: string,
): EntityStats | null {
  const key = `${entityType}:${entityId}`;
  const entry = entityStatsMemoryCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.data;
}

function setEntityStatsMemory(
  entityType: "album" | "song",
  entityId: string,
  data: EntityStats,
) {
  const key = `${entityType}:${entityId}`;
  entityStatsMemoryCache.set(key, {
    data,
    expiresAt: Date.now() + ENTITY_STATS_TTL_MS,
  });
  if (entityStatsMemoryCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of entityStatsMemoryCache.entries()) {
      if (v.expiresAt <= now) entityStatsMemoryCache.delete(k);
    }
  }
}

export async function getEntityStats(
  entityType: "album" | "song",
  entityId: string,
): Promise<EntityStats> {
  const mem = getEntityStatsFromMemory(entityType, entityId);
  if (mem) return mem;

  try {
    const supabase = getSupabase();
    const canonicalId =
      entityType === "album"
        ? await resolveCanonicalAlbumUuidFromEntityId(supabase, entityId)
        : await resolveCanonicalTrackUuidFromEntityId(supabase, entityId);
    if (!canonicalId) {
      const empty = { ...DEFAULT_ENTITY_STATS };
      setEntityStatsMemory(entityType, entityId, empty);
      return empty;
    }

    let result: EntityStats | null = null;

    if (entityType === "album") {
      const { data: row, error } = await supabase
        .from("album_stats")
        .select("listen_count, review_count, avg_rating, rating_distribution")
        .eq("album_id", canonicalId)
        .maybeSingle();

      if (!error && row) {
        result = mapAlbumStatsRow(
          row as {
            listen_count: number;
            review_count: number;
            avg_rating: number | null;
            rating_distribution: unknown;
          },
        );
      }
      if (!error && !row) {
        console.warn("[queries] getEntityStats cache miss (album):", entityId);
      }
    } else {
      const { data: row, error } = await supabase
        .from("track_stats")
        .select("listen_count, review_count, avg_rating")
        .eq("track_id", canonicalId)
        .maybeSingle();

      if (!error && row) {
        result = mapTrackStatsRow(
          row as {
            listen_count: number;
            review_count: number;
            avg_rating: number | null;
          },
        );
      }
      if (!error && !row) {
        console.warn("[queries] getEntityStats cache miss (track):", entityId);
      }
    }

    if (!result) result = await getEntityStatsLive(entityType, canonicalId);
    setEntityStatsMemory(entityType, entityId, result);
    return result;
  } catch (e) {
    console.error("[queries] getEntityStats failed:", e);
    return { ...DEFAULT_ENTITY_STATS };
  }
}

const TRACK_STATS_CHUNK = 120;

/** Single batch for getTrackStatsForTrackIds (Supabase .in() size limits). */
async function getTrackStatsForTrackIdsSingleBatch(
  uniqueIds: string[],
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = {
    listen_count: 0,
    average_rating: null,
    review_count: 0,
  };
  if (uniqueIds.length === 0) return {};

  const supabase = getSupabase();
  const result: Record<string, EntityStats> = {};

  const { data: rows, error } = await supabase
    .from("track_stats")
    .select("track_id, listen_count, review_count, avg_rating")
    .in("track_id", uniqueIds);

  if (!error && rows?.length) {
    for (const row of rows as {
      track_id: string;
      listen_count: number;
      review_count: number;
      avg_rating: number | null;
    }[]) {
      result[row.track_id] = mapTrackStatsRow(row);
    }
  }

  const missingIds = uniqueIds.filter((id) => !(id in result));
  if (missingIds.length > 0) {
    const [listenCounts, reviewsRes] = await Promise.all([
      countLogsByTrackIds(supabase, missingIds),
      supabase
        .from("reviews")
        .select("entity_id, rating")
        .eq("entity_type", "song")
        .in("entity_id", missingIds),
    ]);

    const reviewCounts = new Map<string, number>();
    const ratingSums = new Map<string, number>();
    for (const row of reviewsRes.data ?? []) {
      reviewCounts.set(
        row.entity_id,
        (reviewCounts.get(row.entity_id) ?? 0) + 1,
      );
      ratingSums.set(
        row.entity_id,
        (ratingSums.get(row.entity_id) ?? 0) + row.rating,
      );
    }

    for (const trackId of missingIds) {
      const listen_count = listenCounts.get(trackId) ?? 0;
      const review_count = reviewCounts.get(trackId) ?? 0;
      const sum = ratingSums.get(trackId) ?? 0;
      const average_rating =
        review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;
      result[trackId] = { listen_count, average_rating, review_count };
    }
  }

  return Object.fromEntries(uniqueIds.map((id) => [id, result[id] ?? empty]));
}

/** Per-track stats for multiple song IDs. Reads from track_stats first; fallback aggregation for missing. */
export async function getTrackStatsForTrackIds(
  trackIds: string[],
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = {
    listen_count: 0,
    average_rating: null,
    review_count: 0,
  };
  if (trackIds.length === 0) return {};

  try {
    const uniqueIds = [...new Set(trackIds)];
    if (uniqueIds.length <= TRACK_STATS_CHUNK) {
      const result = await getTrackStatsForTrackIdsSingleBatch(uniqueIds);
      return Object.fromEntries(trackIds.map((id) => [id, result[id] ?? empty]));
    }
    const merged: Record<string, EntityStats> = {};
    for (let i = 0; i < uniqueIds.length; i += TRACK_STATS_CHUNK) {
      const chunk = uniqueIds.slice(i, i + TRACK_STATS_CHUNK);
      Object.assign(merged, await getTrackStatsForTrackIdsSingleBatch(chunk));
    }
    return Object.fromEntries(trackIds.map((id) => [id, merged[id] ?? empty]));
  } catch (e) {
    console.error("[statsService] getTrackStatsForTrackIds failed:", e);
    return Object.fromEntries(trackIds.map((id) => [id, empty]));
  }
}

export async function getAlbumEngagementStats(albumId: string): Promise<{
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
  favorite_count: number;
}> {
  const stats = await getEntityStats("album", albumId);
  let favorite_count = 0;
  try {
    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalAlbumUuidFromEntityId(
      supabase,
      albumId,
    );
    if (canonicalId) {
      const { data: row } = await supabase
        .from("entity_stats")
        .select("favorite_count")
        .eq("entity_type", "album")
        .eq("entity_id", canonicalId)
        .maybeSingle();
      favorite_count = Number(row?.favorite_count ?? 0);
    }
  } catch (e) {
    console.warn("[statsService] getAlbumEngagementStats favorite_count:", e);
  }
  return {
    listen_count: stats.listen_count,
    review_count: stats.review_count,
    avg_rating: stats.average_rating,
    favorite_count,
  };
}

