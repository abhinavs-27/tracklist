import { getSupabase } from "../lib/supabase";
// ---------------------------------------------------------------------------
// Entity stats (listen count + rating aggregation)
// ---------------------------------------------------------------------------

export type EntityStats = {
  listen_count: number;
  average_rating: number | null;
  review_count: number;
  /** Count of reviews per star 1–5 for histogram/bar chart. */
  rating_distribution?: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
};

const DEFAULT_ENTITY_STATS: EntityStats = {
  listen_count: 0,
  average_rating: null,
  review_count: 0,
  rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

function mapAlbumStatsRow(row: {
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
  rating_distribution: unknown;
}): EntityStats {
  const dist = row.rating_distribution as Record<string, number> | null;
  const rating_distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  } = {
    1: dist?.["1"] ?? 0,
    2: dist?.["2"] ?? 0,
    3: dist?.["3"] ?? 0,
    4: dist?.["4"] ?? 0,
    5: dist?.["5"] ?? 0,
  };
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
  entityId: string,
): Promise<EntityStats> {
  const supabase = getSupabase();

  let listen_count = 0;
  if (entityType === "song") {
    const { count } = await supabase
      .from("logs")
      .select("id", { count: "exact", head: true })
      .eq("track_id", entityId);
    listen_count = count ?? 0;
  } else {
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", entityId);
    if (tracks?.length) {
      const ids = tracks.map((t) => t.id);
      const { count } = await supabase
        .from("logs")
        .select("id", { count: "exact", head: true })
        .in("track_id", ids);
      listen_count = count ?? 0;
    }
  }

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("rating")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  const ratings = (reviewRows ?? []).map((r) => r.rating);
  const review_count = ratings.length;
  const sum = ratings.reduce((a, b) => a + b, 0);
  const average_rating =
    review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;

  const rating_distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  } = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const r of ratings) {
    const star = Math.max(1, Math.min(5, Math.floor(r)));
    rating_distribution[star as 1 | 2 | 3 | 4 | 5]++;
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
    let result: EntityStats | null = null;

    if (entityType === "album") {
      const { data: row, error } = await supabase
        .from("album_stats")
        .select("listen_count, review_count, avg_rating, rating_distribution")
        .eq("album_id", entityId)
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
        .eq("track_id", entityId)
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

    if (!result) result = await getEntityStatsLive(entityType, entityId);
    setEntityStatsMemory(entityType, entityId, result);
    return result;
  } catch (e) {
    console.error("[queries] getEntityStats failed:", e);
    return { ...DEFAULT_ENTITY_STATS };
  }
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
    const supabase = getSupabase();
    const uniqueIds = [...new Set(trackIds)];
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
      const [logsRes, reviewsRes] = await Promise.all([
        supabase.from("logs").select("track_id").in("track_id", missingIds),
        supabase
          .from("reviews")
          .select("entity_id, rating")
          .eq("entity_type", "song")
          .in("entity_id", missingIds),
      ]);

      const listenCounts = new Map<string, number>();
      for (const row of logsRes.data ?? []) {
        listenCounts.set(
          row.track_id,
          (listenCounts.get(row.track_id) ?? 0) + 1,
        );
      }
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

    return Object.fromEntries(trackIds.map((id) => [id, result[id] ?? empty]));
  } catch (e) {
    console.error("[queries] getTrackStatsForTrackIds failed:", e);
    return Object.fromEntries(trackIds.map((id) => [id, empty]));
  }
}

export async function getAlbumEngagementStats(albumId: string): Promise<{
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
}> {
  const stats = await getEntityStats("album", albumId);
  return {
    listen_count: stats.listen_count,
    review_count: stats.review_count,
    avg_rating: stats.average_rating,
  };
}

