import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAlbums } from "@/lib/spotify";
import {
  getCachedAllArtistAlbums,
  getCachedArtistAlbumsFirstPage,
  getCachedArtistAlbumsFirstPageMeta,
  getCachedPeekArtistAlbumsHasMore,
  SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT,
} from "@/lib/spotify/getAllArtistAlbums";
import { upsertAlbumFromSpotify } from "@/lib/spotify-cache";
import {
  getTrackIdByExternalId,
  mapSpotifyAlbumIdsToCanonical,
  resolveCanonicalAlbumUuidFromEntityId,
  resolveCanonicalArtistUuidFromEntityId,
  resolveCanonicalTrackUuidFromEntityId,
} from "@/lib/catalog/entity-resolution";
import {
  isValidLfmCatalogId,
  isValidSpotifyId,
  isValidUuid,
  sanitizeString,
} from "@/lib/validation";
import type {
  ListenLogWithUser,
  ReviewWithUser,
  FeedActivity,
  FeedListenSession,
  AlbumRecommendation,
  ReviewsResult,
  UserStreak,
  WeeklyReportRow,
  PeriodReportRow,
  TrendingEntity,
  RisingArtist,
  HiddenGem,
} from "@/types";

/**
 * Helper to fetch a Map of user data from a list of user IDs.
 * Exported for use in API routes that need to manualy enrich data.
 */
export async function fetchUserMap<
  T extends { id: string } = { id: string; username: string; avatar_url: string | null },
>(
  supabase:
    | Awaited<ReturnType<typeof createSupabaseServerClient>>
    | Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  userIds: string[],
  select = "id, username, avatar_url",
): Promise<Map<string, T>> {
  if (userIds.length === 0) return new Map();
  const { data: users } = await supabase
    .from("users")
    .select(select)
    .in("id", userIds);
  return new Map(
    ((users as { id: string }[] | null) ?? []).map((u) => [
      u.id,
      u as unknown as T,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Passive listen logs (Spotify history)
// ---------------------------------------------------------------------------

export async function getListenLogsForUser(
  userId: string,
  limit = 30,
  offset = 0,
  spotifyTrackId?: string,
): Promise<ListenLogWithUser[]> {
  return getListenLogsInternal({ userId, limit, offset, spotifyTrackId });
}

export async function getListenLogsForTrack(
  spotifyTrackId: string,
  limit = 30,
  offset = 0,
): Promise<ListenLogWithUser[]> {
  const raw = await getListenLogsInternal({
    spotifyTrackId,
    limit: Math.max(limit * 5, 50),
    offset,
  });
  const seen = new Set<string>();
  const onePerUser = raw.filter((log) => {
    if (seen.has(log.user_id)) return false;
    seen.add(log.user_id);
    return true;
  });
  return onePerUser.slice(0, limit);
}

async function getListenLogsInternal(opts: {
  userId?: string;
  spotifyTrackId?: string;
  limit: number;
  offset?: number;
}): Promise<ListenLogWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const from = opts.offset ?? 0;
    const to = from + opts.limit - 1;

    const selectFields = ["id", "listened_at", "source", "created_at"];
    if (!opts.userId) selectFields.push("user_id");
    if (!opts.spotifyTrackId) selectFields.push("track_id");

    let query = supabase
      .from("logs")
      .select(selectFields.join(", "))
      .order("listened_at", { ascending: false })
      .range(from, to);

    if (opts.userId) query = query.eq("user_id", opts.userId);

    let resolvedTrackFilter: string | undefined;
    if (opts.spotifyTrackId) {
      let tf = opts.spotifyTrackId;
      if (isValidSpotifyId(tf)) {
        const uuid = await getTrackIdByExternalId(supabase, "spotify", tf);
        if (!uuid) return [];
        tf = uuid;
      } else if (isValidLfmCatalogId(tf)) {
        const uuid = await getTrackIdByExternalId(supabase, "lastfm", tf);
        if (!uuid) return [];
        tf = uuid;
      } else if (!isValidUuid(tf)) {
        return [];
      }
      resolvedTrackFilter = tf;
      query = query.eq("track_id", resolvedTrackFilter);
    }

    const { data: rawLogs, error } = await query;
    if (error || !rawLogs?.length) return [];

    const logs = rawLogs.map((l: any) => ({
      ...l,
      user_id: opts.userId ?? l.user_id,
      track_id: resolvedTrackFilter ?? l.track_id,
    })) as {
      id: string;
      user_id: string;
      track_id: string;
      listened_at: string;
      source: string | null;
      created_at: string;
    }[];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    return logs.map((log) => ({
      ...log,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsInternal failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Active reviews (ratings + optional text)
// ---------------------------------------------------------------------------

/** Reviews for an entity. Capped at 20 for performance. */
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
): Promise<ReviewsResult | null> {
  const cappedLimit = Math.min(Math.max(1, limit), 20);
  try {
    const supabase = await createSupabaseServerClient();

    const canonicalEntityId =
      entityType === "album"
        ? await resolveCanonicalAlbumUuidFromEntityId(supabase, entityId)
        : await resolveCanonicalTrackUuidFromEntityId(supabase, entityId);
    if (!canonicalEntityId) {
      return {
        reviews: [],
        average_rating: null,
        count: 0,
        my_review: null,
      };
    }

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, rating, review_text, created_at, updated_at",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", canonicalEntityId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (error) return null;

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const reviewRows = rows ?? [];
    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    const reviews: ReviewWithUser[] = reviewRows.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        username: u?.username ?? null,
        entity_type: entityType,
        entity_id: entityId,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: u
          ? { id: u.id, username: u.username, avatar_url: u.avatar_url ?? null }
          : null,
      };
    });

    const count = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const average_rating =
      count > 0 ? Math.round((sum / count) * 10) / 10 : null;

    const { count: total_count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", canonicalEntityId);

    let my_review: ReviewWithUser | null = null;
    if (userId) {
      const { data: myRow } = await supabase
        .from("reviews")
        .select(
          "id, rating, review_text, created_at, updated_at",
        )
        .eq("entity_type", entityType)
        .eq("entity_id", canonicalEntityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (myRow) {
        const sessionUsername =
          (session?.user as { username?: string } | undefined)?.username ??
          null;
        my_review = {
          id: myRow.id,
          user_id: userId,
          username: sessionUsername,
          entity_type: entityType,
          entity_id: entityId,
          rating: myRow.rating,
          review_text: myRow.review_text ?? null,
          created_at: myRow.created_at,
          updated_at: myRow.updated_at,
        };
      }
    }

    return {
      reviews,
      average_rating,
      count: total_count ?? reviews.length,
      my_review,
    };
  } catch (e) {
    console.error("[queries] getReviewsForEntity failed:", e);
    return null;
  }
}

/** Fetch recent reviews by a user (for "Recent Activity" on profile). */
export async function getReviewsForUser(
  userId: string,
  limit = 30,
  offset = 0,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !rows?.length) return [];

    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("id", userId);

    const user = users?.[0] ?? null;

    return rows.map((r) => ({
      id: r.id,
      user_id: userId,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user,
    }));
  } catch (e) {
    console.error("[queries] getReviewsForUser failed:", e);
    return [];
  }
}

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
  /** Canonical `albums.id` or `tracks.id` UUID. */
  canonicalEntityId: string,
): Promise<EntityStats> {
  const supabase = await createSupabaseServerClient();

  let listen_count = 0;
  if (entityType === "song") {
    const { count } = await supabase
      .from("logs")
      .select("id", { count: "exact", head: true })
      .eq("track_id", canonicalEntityId);
    listen_count = count ?? 0;
  } else {
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalEntityId);
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
    .eq("entity_id", canonicalEntityId);

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
    const supabase = await createSupabaseServerClient();
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

/** Single batch for {@link getTrackStatsForTrackIds} (Supabase `.in()` size limits). */
async function getTrackStatsForTrackIdsSingleBatch(
  uniqueIds: string[],
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = {
    listen_count: 0,
    average_rating: null,
    review_count: 0,
  };
  if (uniqueIds.length === 0) return {};

  const supabase = await createSupabaseServerClient();
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

  return Object.fromEntries(uniqueIds.map((id) => [id, result[id] ?? empty]));
}

const TRACK_STATS_CHUNK = 120;

/** PostgREST `.in()` size + songs pagination; must match chunked reads elsewhere. */
const LEADERBOARD_ALBUM_IN_CHUNK = 120;

/** All song IDs for albums in range (chunked `.in`, paginated past Supabase 1k default). */
async function fetchSongIdsForAlbumIdsForLeaderboard(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  albumIds: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
    const albumChunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from("tracks")
        .select("id")
        .in("album_id", albumChunk)
        .range(from, from + pageSize - 1);
      if (error) {
        console.error(
          "[queries] fetchSongIdsForAlbumIdsForLeaderboard songs:",
          error,
        );
        break;
      }
      const rows = data ?? [];
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push(r.id);
        }
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }
  return out;
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
    console.error("[queries] getTrackStatsForTrackIds failed:", e);
    return Object.fromEntries(trackIds.map((id) => [id, empty]));
  }
}

const LOG_COUNT_CHUNK = 400;

/** One GROUP BY query per chunk; falls back to {@link getTrackStatsForTrackIds} if RPC missing. */
async function countLogsByTrackIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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
// Leaderboard
// ---------------------------------------------------------------------------

export type LeaderboardEntry = {
  id: string;
  entity_type: "song" | "album";
  name: string;
  artist: string;
  artwork_url: string | null;
  total_plays: number;
  average_rating: number | null;
  weighted_score?: number;
  favorite_count?: number;
};

export type LeaderboardFilters = {
  year?: number;
  decade?: number;
  startYear?: number;
  endYear?: number;
};

export async function getLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album" = "song",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { year, decade, startYear, endYear } = filters;

    let albumIds: string[] | null = null;

    // Prefer explicit year range if provided (paginate: default PostgREST cap is 1000 rows)
    if (startYear != null || endYear != null) {
      const from = startYear ?? endYear!;
      const to = endYear ?? startYear!;
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      let failed = false;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .gte("release_date", `${from}-01-01`)
          .lte("release_date", `${to}-12-31`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) {
          console.error("[queries] getLeaderboard albums (year range):", error);
          failed = true;
          break;
        }
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = failed ? [] : acc;
    } else if (year != null) {
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      let failed = false;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .like("release_date", `${year}%`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) {
          console.error("[queries] getLeaderboard albums (year):", error);
          failed = true;
          break;
        }
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = failed ? [] : acc;
    } else if (decade != null) {
      const yearNum = decade + 10;
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      let failed = false;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .gte("release_date", `${decade}-01-01`)
          .lt("release_date", `${yearNum}-01-01`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) {
          console.error("[queries] getLeaderboard albums (decade):", error);
          failed = true;
          break;
        }
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = failed ? [] : acc;
    }

    if (albumIds !== null && albumIds.length === 0) return [];

    // ------------------------ Most Favorited (albums via entity_stats) ------------------------
    // favorite_count is populated from user_favorite_albums by
    // sync_favorite_counts_from_user_favorite_albums() (cron + after favorites save).
    // Not the same as refresh_entity_stats() which only fills legacy album_stats/track_stats.
    // Currently only supports albums; ignore entity parameter for this type.
    if (type === "mostFavorited") {
      let statsQuery = supabase
        .from("entity_stats")
        .select("entity_id, favorite_count, play_count, avg_rating")
        .eq("entity_type", "album")
        .order("favorite_count", { ascending: false })
        .order("play_count", { ascending: false })
        .limit(Math.max(limit * 2, 100));

      if (albumIds && albumIds.length > 0) {
        statsQuery = statsQuery.in("entity_id", albumIds);
      }

      const { data: statsRows, error: statsError } = await statsQuery;
      if (statsError || !statsRows?.length) return [];

      const albumIdsFromStats = statsRows.map((r) => r.entity_id);
      const { data: albumRows } = await supabase
        .from("albums")
        .select("id, name, artist_id, image_url")
        .in("id", albumIdsFromStats);

      const albumsArray = (albumRows ?? []) as {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      }[];
      const albumMap = new Map(albumsArray.map((a) => [a.id, a]));
      const artistIds = [...new Set(albumsArray.map((a) => a.artist_id))];
      const { data: artistRows } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      const artistMap = new Map(
        (artistRows ?? []).map((a) => [a.id, a.name]),
      );

      const entries: LeaderboardEntry[] = statsRows
        .map((row): LeaderboardEntry | null => {
          const album = albumMap.get(row.entity_id);
          if (!album) return null;
          const total_plays = row.play_count ?? 0;
          const average_rating = row.avg_rating != null ? Number(row.avg_rating) : null;
          const artistName = artistMap.get(album.artist_id) ?? "Unknown";
          return {
            entity_type: "album",
            id: row.entity_id,
            name: album.name,
            artist: artistName,
            artwork_url: album.image_url ?? null,
            total_plays,
            average_rating,
            favorite_count: row.favorite_count,
          };
        })
        .filter((x): x is LeaderboardEntry => x != null);

      return entries.slice(0, limit);
    }

    // ---------------- Popular / Top Rated ----------------
    if (entity === "song") {
      let statsRows: {
        track_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[];

      if (albumIds && albumIds.length > 0) {
        const trackIds = await fetchSongIdsForAlbumIdsForLeaderboard(
          supabase,
          albumIds,
        );
        if (trackIds.length === 0) return [];
        const merged: {
          track_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[] = [];
        for (let i = 0; i < trackIds.length; i += TRACK_STATS_CHUNK) {
          const chunk = trackIds.slice(i, i + TRACK_STATS_CHUNK);
          const { data: rows, error: statsError } = await supabase
            .from("track_stats")
            .select("track_id, listen_count, avg_rating")
            .in("track_id", chunk);
          if (statsError) {
            console.error(
              "[queries] getLeaderboard track_stats (year filter):",
              statsError,
            );
            return [];
          }
          if (rows?.length)
            merged.push(
              ...(rows as {
                track_id: string;
                listen_count: number;
                avg_rating: number | null;
              }[]),
            );
        }
        if (merged.length === 0) return [];
        statsRows = merged;
      } else {
        /** Unfiltered charts: only need `limit` rows after join; cap fetch to avoid loading 500 songs. */
        const statsCap = Math.min(500, Math.max(limit * 20, 40));
        const { data: rows, error: statsError } = await supabase
          .from("track_stats")
          .select("track_id, listen_count, avg_rating")
          .order("listen_count", { ascending: false })
          .limit(statsCap);
        if (statsError || !rows?.length) return [];
        statsRows = rows as {
          track_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[];
      }

      const statTrackIds = statsRows.map((r) => r.track_id);
      const songArray: {
        id: string;
        name: string;
        album_id: string;
        artist_id: string;
      }[] = [];
      for (let i = 0; i < statTrackIds.length; i += TRACK_STATS_CHUNK) {
        const chunk = statTrackIds.slice(i, i + TRACK_STATS_CHUNK);
        const { data: songRows } = await supabase
          .from("tracks")
          .select("id, name, album_id, artist_id")
          .in("id", chunk);
        songArray.push(
          ...((songRows ?? []) as {
            id: string;
            name: string;
            album_id: string;
            artist_id: string;
          }[]),
        );
      }

      const songMap = new Map(songArray.map((s) => [s.id, s]));
      const albumIdsForSongs = [...new Set(songArray.map((s) => s.album_id))];
      const artistIds = [...new Set(songArray.map((s) => s.artist_id))];

      const albumRowsFlat: { id: string; image_url: string | null }[] = [];
      for (let i = 0; i < albumIdsForSongs.length; i += TRACK_STATS_CHUNK) {
        const chunk = albumIdsForSongs.slice(i, i + TRACK_STATS_CHUNK);
        const { data } = await supabase
          .from("albums")
          .select("id, image_url")
          .in("id", chunk);
        albumRowsFlat.push(...((data ?? []) as typeof albumRowsFlat));
      }
      const artistRowsFlat: { id: string; name: string }[] = [];
      for (let i = 0; i < artistIds.length; i += TRACK_STATS_CHUNK) {
        const chunk = artistIds.slice(i, i + TRACK_STATS_CHUNK);
        const { data } = await supabase
          .from("artists")
          .select("id, name")
          .in("id", chunk);
        artistRowsFlat.push(...((data ?? []) as typeof artistRowsFlat));
      }

      const albumMap = new Map(
        albumRowsFlat.map((a) => [a.id, a.image_url ?? null]),
      );
      const artistMap = new Map(
        artistRowsFlat.map((a) => [a.id, a.name] as const),
      );

      const entries: LeaderboardEntry[] = statsRows
        .map((row) => {
          const song = songMap.get(row.track_id);
          if (!song) return null;
          const artistName = artistMap.get(song.artist_id) ?? "Unknown";
          const total_plays = row.listen_count ?? 0;
          const average_rating =
            row.avg_rating != null ? Number(row.avg_rating) : null;
          const weighted_score =
            type === "topRated" && average_rating != null
              ? average_rating * Math.log10(1 + total_plays)
              : undefined;
          const artwork_url = albumMap.get(song.album_id) ?? null;
          return {
            entity_type: "song",
            id: song.id,
            name: song.name,
            artist: artistName,
            artwork_url,
            total_plays,
            average_rating,
            ...(weighted_score !== undefined && { weighted_score }),
          };
        })
        .filter((x): x is LeaderboardEntry => x != null);

      if (type === "popular") {
        entries.sort((a, b) => b.total_plays - a.total_plays);
      } else {
        entries.sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0));
      }

      return entries.slice(0, limit);
    }

    // entity === "album"
    // Use album_stats for popularity / rating.
    const albumStatsLimit = 500;
    let albumStatsRows:
      | {
          album_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[]
      | null = null;

    if (albumIds && albumIds.length > 0) {
      const mergedAlbumStats: {
        album_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[] = [];
      for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
        const chunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
        const { data: rows, error: statsError } = await supabase
          .from("album_stats")
          .select("album_id, listen_count, avg_rating")
          .in("album_id", chunk);
        if (statsError) {
          console.error(
            "[queries] getLeaderboard album_stats (year filter):",
            statsError,
          );
          return [];
        }
        if (rows?.length)
          mergedAlbumStats.push(
            ...(rows as {
              album_id: string;
              listen_count: number;
              avg_rating: number | null;
            }[]),
          );
      }
      if (mergedAlbumStats.length === 0) return [];
      albumStatsRows = mergedAlbumStats;
    } else {
      const { data: rows, error: statsError } = await supabase
        .from("album_stats")
        .select("album_id, listen_count, avg_rating")
        .order("listen_count", { ascending: false })
        .limit(albumStatsLimit);
      if (statsError || !rows?.length) return [];
      albumStatsRows = rows as {
        album_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[];
    }

    const albumIdsFromStats = albumStatsRows.map((r) => r.album_id);
    const { data: albumRows } = await supabase
      .from("albums")
      .select("id, name, artist_id, image_url")
      .in("id", albumIdsFromStats);

    const albumsArray =
      (albumRows ?? []) as {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      }[];
    const albumMapFull = new Map(albumsArray.map((a) => [a.id, a]));
    const artistIdsForAlbums = [...new Set(albumsArray.map((a) => a.artist_id))];

    const { data: artistRows } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIdsForAlbums);
    const artistMap = new Map(
      (artistRows ?? []).map(
        (a: { id: string; name: string }) => [a.id, a.name] as const,
      ),
    );

    const albumEntries: LeaderboardEntry[] = albumStatsRows
      .map((row) => {
        const album = albumMapFull.get(row.album_id);
        if (!album) return null;
        const artistName = artistMap.get(album.artist_id) ?? "Unknown";
        const total_plays = row.listen_count ?? 0;
        const average_rating =
          row.avg_rating != null ? Number(row.avg_rating) : null;
        const weighted_score =
          type === "topRated" && average_rating != null
            ? average_rating * Math.log10(1 + total_plays)
            : undefined;
        return {
          entity_type: "album",
          id: album.id,
          name: album.name,
          artist: artistName,
          artwork_url: album.image_url ?? null,
          total_plays,
          average_rating,
          ...(weighted_score !== undefined && { weighted_score }),
        };
      })
      .filter((x): x is LeaderboardEntry => x != null);

    if (type === "popular") {
      albumEntries.sort((a, b) => b.total_plays - a.total_plays);
    } else {
      albumEntries.sort(
        (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
      );
    }

    return albumEntries.slice(0, limit);
  } catch (e) {
    console.error("[queries] getLeaderboard failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Artist-scoped queries
// ---------------------------------------------------------------------------

/** Reviews for any album or track belonging to an artist. */
export async function getReviewsForArtist(
  artistId: string,
  limit = 10,
  offset = 0,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    const [{ data: albumRows }, { data: songRows }] = await Promise.all([
      supabase
        .from("albums")
        .select("id")
        .eq("artist_id", canonicalArtistId)
        .limit(1000),
      supabase
        .from("tracks")
        .select("id")
        .eq("artist_id", canonicalArtistId)
        .limit(1000),
    ]);

    const entityIds = [
      ...(albumRows ?? []).map((a) => a.id),
      ...(songRows ?? []).map((s) => s.id),
    ];
    if (entityIds.length === 0) return [];

    const from = offset;
    const to = offset + limit - 1;

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !rows?.length) return [];

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const userMap = await fetchUserMap<{ id: string; username: string }>(
      supabase,
      userIds,
      "id, username"
    );

    return rows.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        username: u?.username ?? null,
        entity_type: r.entity_type as "album" | "song",
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: u
          ? { id: u.id, username: u.username, avatar_url: null }
          : null,
      };
    });
  } catch (e) {
    console.error("[queries] getReviewsForArtist failed:", e);
    return [];
  }
}

export type ArtistPopularTrack = {
  track: SpotifyApi.TrackObjectFull;
  playCount: number;
  avgRating: number | null;
  ratingCount: number;
};

/** Top tracks for an artist: ordered by listen count (track_stats + logs), then name. */
export async function getTopTracksForArtist(
  artistId: string,
  limit = 10,
): Promise<ArtistPopularTrack[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    const { data: songRowsRaw } = await supabase
      .from("tracks")
      .select("id, name, album_id, duration_ms, artist_id")
      .eq("artist_id", canonicalArtistId)
      .limit(1000);
    if (!songRowsRaw?.length) return [];

    const songRows = songRowsRaw as {
      id: string;
      name: string;
      album_id: string;
      duration_ms: number | null;
      artist_id: string;
    }[];

    const trackIds = songRows.map((s) => s.id);
    const statsMap = await getTrackStatsForTrackIds(trackIds);

    const sortedIds = [...trackIds]
      .sort((a, b) => {
        const countA = statsMap[a]?.listen_count ?? 0;
        const countB = statsMap[b]?.listen_count ?? 0;
        if (countB !== countA) return countB - countA;
        const nameA = songRows.find((s) => s.id === a)?.name ?? "";
        const nameB = songRows.find((s) => s.id === b)?.name ?? "";
        return nameA.localeCompare(nameB);
      })
      .slice(0, limit);

    const songMap = new Map(songRows.map((s) => [s.id, s]));
    const albumIds = [...new Set(songRows.map((s) => s.album_id))];
    const artistIds = [...new Set(songRows.map((s) => s.artist_id))];

    const [{ data: albumRows }, { data: artistRows }] = await Promise.all([
      supabase.from("albums").select("id, name, image_url").in("id", albumIds),
      supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds.filter(Boolean) as string[]),
    ]);
    const albumMap = new Map((albumRows ?? []).map((a) => [a.id, a]));
    const artistMap = new Map((artistRows ?? []).map((a) => [a.id, a]));

    return sortedIds
      .map((id) => {
        const song = songMap.get(id);
        if (!song || song.artist_id !== canonicalArtistId) return null;
        const album = albumMap.get(song.album_id);
        const st = statsMap[id];
        const track = {
          id: song.id,
          name: song.name,
          artists: [
            {
              id: song.artist_id,
              name: artistMap.get(song.artist_id)?.name ?? "",
            },
          ],
          duration_ms: song.duration_ms ?? undefined,
          album: album
            ? {
                id: album.id,
                name: album.name,
                images: album.image_url
                  ? [{ url: album.image_url }]
                  : undefined,
              }
            : undefined,
        } as SpotifyApi.TrackObjectFull;
        return {
          track,
          playCount: st?.listen_count ?? 0,
          avgRating: st?.average_rating ?? null,
          ratingCount: st?.review_count ?? 0,
        };
      })
      .filter((x): x is ArtistPopularTrack => x !== null);
  } catch (e) {
    console.error("[queries] getTopTracksForArtist failed:", e);
    return [];
  }
}

/** Recent listen logs for tracks by an artist. */
export async function getListenLogsForArtist(
  artistId: string,
  limit = 20,
  offset = 0,
): Promise<ListenLogWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    const { data: songRows } = await supabase
      .from("tracks")
      .select("id")
      .eq("artist_id", canonicalArtistId)
      .limit(1000);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const from = offset;
    const to = offset + limit - 1;

    const { data: logs, error } = await supabase
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .range(from, to);

    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      track_id: log.track_id,
      listened_at: log.listened_at,
      source: log.source ?? null,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsForArtist failed:", e);
    return [];
  }
}

/** Recent listen logs for tracks on an album (Spotify album id). */
export async function getListenLogsForAlbum(
  albumId: string,
  limit = 20,
  offset = 0,
): Promise<ListenLogWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const canonicalAlbumId =
      await resolveCanonicalAlbumUuidFromEntityId(supabase, albumId);
    if (!canonicalAlbumId) return [];

    const { data: songRows } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalAlbumId)
      .limit(1000);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const from = offset;
    const to = offset + limit - 1;

    const { data: logs, error } = await supabase
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .range(from, to);

    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      track_id: log.track_id,
      listened_at: log.listened_at,
      source: log.source ?? null,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsForAlbum failed:", e);
    return [];
  }
}

export type ArtistAlbumEngagementRow = {
  id: string;
  name: string;
  image_url: string | null;
  listen_count: number;
  review_count: number;
  average_rating: number | null;
};

const ALBUM_ID_IN_CHUNK = 120;
const REVIEW_IN_CHUNK = 120;

async function enrichSpotifyAlbumsForArtist(
  artistId: string,
  spotifyAlbums: SpotifyApi.AlbumObjectSimplified[],
): Promise<ArtistAlbumEngagementRow[]> {
  if (!spotifyAlbums.length) return [];

  const supabase = await createSupabaseServerClient();
  const albumIds = spotifyAlbums.map((a) => a.id);

  const canonicalArtistId =
    await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
  const spotifyToCanonicalAlbum = await mapSpotifyAlbumIdsToCanonical(
    supabase,
    albumIds,
  );
  const canonicalToSpotifyAlbum = new Map<string, string>();
  for (const [spotifyAid, canonicalAid] of spotifyToCanonicalAlbum) {
    canonicalToSpotifyAlbum.set(canonicalAid, spotifyAid);
  }

  const albumToTracks = new Map<string, string[]>();
  if (canonicalArtistId) {
    for (let i = 0; i < albumIds.length; i += ALBUM_ID_IN_CHUNK) {
      const chunk = albumIds.slice(i, i + ALBUM_ID_IN_CHUNK);
      const canonicalChunk = chunk
        .map((sid) => spotifyToCanonicalAlbum.get(sid))
        .filter((id): id is string => Boolean(id));
      if (canonicalChunk.length === 0) continue;

      const { data: songRows } = await supabase
        .from("tracks")
        .select("id, album_id")
        .eq("artist_id", canonicalArtistId)
        .in("album_id", canonicalChunk);
      for (const s of songRows ?? []) {
        const spotifyAid = canonicalToSpotifyAlbum.get(s.album_id);
        if (!spotifyAid) continue;
        const list = albumToTracks.get(spotifyAid) ?? [];
        list.push(s.id);
        albumToTracks.set(spotifyAid, list);
      }
    }
  }

  const allTrackIds = [...new Set([...albumToTracks.values()].flat())];
  const playByTrack = await countLogsByTrackIds(supabase, allTrackIds);

  const reviewAgg = new Map<string, { count: number; sum: number }>();
  for (let i = 0; i < albumIds.length; i += REVIEW_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + REVIEW_IN_CHUNK);
    const canonicalChunk = chunk
      .map((sid) => spotifyToCanonicalAlbum.get(sid))
      .filter((id): id is string => Boolean(id));
    if (canonicalChunk.length === 0) continue;
    const { data: revRows } = await supabase
      .from("reviews")
      .select("entity_id, rating")
      .eq("entity_type", "album")
      .in("entity_id", canonicalChunk);
    for (const r of revRows ?? []) {
      const spotifyEntity = canonicalToSpotifyAlbum.get(r.entity_id);
      if (!spotifyEntity) continue;
      const cur = reviewAgg.get(spotifyEntity) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += r.rating;
      reviewAgg.set(spotifyEntity, cur);
    }
  }

  const orderIndex = new Map(spotifyAlbums.map((a, i) => [a.id, i]));

  const rows: ArtistAlbumEngagementRow[] = spotifyAlbums.map((a) => {
    const tids = albumToTracks.get(a.id) ?? [];
    let listen_count = 0;
    for (const tid of tids) {
      listen_count += playByTrack.get(tid) ?? 0;
    }
    const rv = reviewAgg.get(a.id);
    const review_count = rv?.count ?? 0;
    const average_rating =
      review_count > 0 && rv
        ? Math.round((rv.sum / review_count) * 10) / 10
        : null;
    return {
      id: a.id,
      name: a.name,
      image_url: a.images?.[0]?.url ?? null,
      listen_count,
      review_count,
      average_rating,
    };
  });

  rows.sort((a, b) => {
    if (b.listen_count !== a.listen_count) return b.listen_count - a.listen_count;
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
  });

  return rows;
}

async function fetchArtistAlbumsWithEngagement(
  artistId: string,
  scope: "first-page" | "full",
): Promise<ArtistAlbumEngagementRow[]> {
  const spotifyAlbums =
    scope === "first-page"
      ? await getCachedArtistAlbumsFirstPage(artistId)
      : await getCachedAllArtistAlbums(artistId);
  return enrichSpotifyAlbumsForArtist(artistId, spotifyAlbums);
}

/**
 * Full Spotify album list + batched log/review aggregates.
 * Not wrapped in unstable_cache: this path uses createSupabaseServerClient (cookies),
 * which is incompatible with Next.js cache callbacks.
 * Spotify: first page only on the artist page; full paginated list on /artist/[id]/albums.
 */
export async function getArtistAlbumsWithEngagement(
  artistId: string,
): Promise<ArtistAlbumEngagementRow[]> {
  try {
    return await fetchArtistAlbumsWithEngagement(artistId, "full");
  } catch (e) {
    console.error("[queries] getArtistAlbumsWithEngagement failed:", e);
    return [];
  }
}

export type PopularAlbumsForArtistResult = {
  rows: ArtistAlbumEngagementRow[];
  /** True when Spotify has more than the first page; second request peeks offset=pageSize. */
  hasMoreAlbums: boolean;
};

export async function getPopularAlbumsForArtist(
  artistId: string,
  limit = 20,
): Promise<PopularAlbumsForArtistResult> {
  try {
    const meta = await getCachedArtistAlbumsFirstPageMeta(artistId);
    if (!meta.albums.length) {
      return { rows: [], hasMoreAlbums: false };
    }
    const enriched = await enrichSpotifyAlbumsForArtist(artistId, meta.albums);
    const rows = enriched.slice(0, limit);
    const hasMoreAlbums =
      meta.rawCount >= SPOTIFY_ARTIST_ALBUMS_PAGE_LIMIT &&
      (await getCachedPeekArtistAlbumsHasMore(artistId));
    return { rows, hasMoreAlbums };
  } catch (e) {
    console.error("[queries] getPopularAlbumsForArtist failed:", e);
    return { rows: [], hasMoreAlbums: false };
  }
}

/** Album engagement: listen count, review count, average rating. */
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

export type FriendAlbumActivityRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  listened_at: string;
  rating: number | null;
};

/** Friends (users the viewer follows) who listened to this album: logs JOIN songs JOIN follows. Optional rating from their review. */
export async function getFriendsAlbumActivity(
  viewerId: string,
  albumId: string,
  limit = 10,
): Promise<FriendAlbumActivityRow[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: songRows } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", albumId);
    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .limit(500);
    const followingIds = (followRows ?? []).map((f) => f.following_id);
    if (followingIds.length === 0) return [];

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: logs, error } = await supabase
      .from("logs")
      .select("user_id, listened_at")
      .in("track_id", trackIds)
      .in("user_id", followingIds)
      .gte("listened_at", thirtyDaysAgo)
      .order("listened_at", { ascending: false })
      .limit(100);

    if (error || !logs?.length) return [];

    const seen = new Set<string>();
    const onePerUser = logs.filter((l) => {
      if (seen.has(l.user_id)) return false;
      seen.add(l.user_id);
      return true;
    });
    const limited = onePerUser.slice(0, limit);

    const userIds = limited.map((l) => l.user_id);
    const [usersRes, reviewsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, username, avatar_url")
        .in("id", userIds),
      supabase
        .from("reviews")
        .select("user_id, rating")
        .eq("entity_type", "album")
        .eq("entity_id", albumId)
        .in("user_id", userIds),
    ]);
    const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
    const ratingMap = new Map(
      (reviewsRes.data ?? []).map((r) => [r.user_id, r.rating]),
    );

    return limited
      .map((l) => {
        const user = userMap.get(l.user_id);
        if (!user) return null;
        return {
          user_id: l.user_id,
          username: user.username,
          avatar_url: user.avatar_url ?? null,
          listened_at: l.listened_at,
          rating: ratingMap.get(l.user_id) ?? null,
        };
      })
      .filter((x): x is FriendAlbumActivityRow => x != null);
  } catch (e) {
    console.error("[queries] getFriendsAlbumActivity failed:", e);
    return [];
  }
}

/** Users who recently listened to tracks from an album. When viewerId is set, returns only users the viewer follows (friends). When viewerId is null, returns [] for privacy. */
export async function getAlbumListeners(
  albumId: string,
  limit = 10,
  viewerId: string | null = null,
): Promise<
  {
    user_id: string;
    username: string;
    avatar_url: string | null;
    listened_at: string;
  }[]
> {
  try {
    if (!viewerId) return [];

    const supabase = await createSupabaseServerClient();

    const { data: songRows } = await supabase
      .from("tracks")
      .select("id")
      .eq("album_id", albumId);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const { data: logs, error } = await supabase
      .from("logs")
      .select("user_id, listened_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .limit(200);

    if (error || !logs?.length) return [];

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .limit(500);
    const followingSet = new Set((followRows ?? []).map((f) => f.following_id));

    const seen = new Set<string>();
    const unique: { user_id: string; listened_at: string }[] = [];
    for (const l of logs) {
      if (!followingSet.has(l.user_id) || l.user_id === viewerId) continue;
      if (seen.has(l.user_id)) continue;
      seen.add(l.user_id);
      unique.push(l);
      if (unique.length >= limit) break;
    }

    if (unique.length === 0) return [];

    const userIds = unique.map((u) => u.user_id);
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return unique
      .map((u) => {
        const user = userMap.get(u.user_id);
        if (!user) return null;
        return {
          user_id: u.user_id,
          username: user.username,
          avatar_url: user.avatar_url ?? null,
          listened_at: u.listened_at,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  } catch (e) {
    console.error("[queries] getAlbumListeners failed:", e);
    return [];
  }
}

/** Album recommendations: "Because you listened to X" — albums co-listened by users who listened to this album. */
export async function getAlbumRecommendations(
  albumId: string,
  limit = 10,
): Promise<AlbumRecommendation[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const capped = Math.min(Math.max(1, limit), 20);
    const { data, error } = await supabase.rpc("get_album_recommendations", {
      p_album_id: albumId,
      p_limit: capped,
    });
    if (error) {
      console.warn(
        "[queries] get_album_recommendations RPC failed:",
        error.message,
      );
      return [];
    }
    return (data ?? []).map((r: { album_id: string; score: number }) => ({
      album_id: r.album_id,
      score: Number(r.score) || 0,
    }));
  } catch (e) {
    console.error("[queries] getAlbumRecommendations failed:", e);
    return [];
  }
}

/** Personalized recommendations: albums listened to by users with similar taste; excludes albums user already listened to. */
export async function getUserRecommendations(
  userId: string,
  limit = 20,
): Promise<AlbumRecommendation[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const capped = Math.min(Math.max(1, limit), 20);
    const { data, error } = await supabase.rpc("get_user_recommendations", {
      p_user_id: userId,
      p_limit: capped,
    });
    if (error) {
      console.warn(
        "[queries] get_user_recommendations RPC failed:",
        error.message,
      );
      return [];
    }
    return (data ?? []).map((r: { album_id: string; score: number }) => ({
      album_id: r.album_id,
      score: Number(r.score) || 0,
    }));
  } catch (e) {
    console.error("[queries] getUserRecommendations failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Engagement: streaks, weekly reports, notifications, achievements
// ---------------------------------------------------------------------------

export async function getUserStreak(
  userId: string,
): Promise<UserStreak | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("user_streaks")
      .select("current_streak, longest_streak, last_listen_date")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      current_streak: Number(data.current_streak) ?? 0,
      longest_streak: Number(data.longest_streak) ?? 0,
      last_listen_date: data.last_listen_date ?? null,
    };
  } catch (e) {
    console.error("[queries] getUserStreak failed:", e);
    return null;
  }
}

export { getWeeklyListeningStory } from "@/lib/reports/weekly-listening-story";

export async function generateWeeklyReport(
  userId: string,
): Promise<WeeklyReportRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("generate_weekly_report", {
      p_user_id: userId,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as {
      id: string;
      user_id: string;
      week_start: string;
      listen_count: number;
      top_artist_id: string | null;
      top_album_id: string | null;
      top_track_id: string | null;
      created_at: string;
    };
    return { ...row, listen_count: Number(row.listen_count) ?? 0 };
  } catch (e) {
    console.error("[queries] generateWeeklyReport failed:", e);
    return null;
  }
}

export async function getPeriodReport(
  userId: string,
  periodType: "week" | "month" | "year",
  offset = 0,
): Promise<PeriodReportRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_period_report", {
      p_user_id: userId,
      p_period_type: periodType,
      p_offset: Math.max(0, offset),
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as {
      period_start: string;
      period_end: string;
      period_label: string;
      listen_count: number;
      top_artist_id: string | null;
      top_album_id: string | null;
      top_track_id: string | null;
    };
    return { ...row, listen_count: Number(row.listen_count) ?? 0 };
  } catch (e) {
    console.error("[queries] getPeriodReport failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// User favorites (albums)
// ---------------------------------------------------------------------------

export type FavoriteAlbum = {
  album_id: string;
  position: number;
  name: string;
  image_url: string | null;
};

export async function getUserFavoriteAlbums(
  userId: string,
): Promise<FavoriteAlbum[]> {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .from("user_favorite_albums")
      .select("album_id, position")
      .eq("user_id", userId)
      .order("position", { ascending: true });

    if (error || !rows?.length) return [];

    const albumIds = rows.map((r) => r.album_id as string);

    // First read whatever albums we already have cached.
    const { data: albums, error: albumsError } = await supabase
      .from("albums")
      .select("id, name, image_url")
      .in("id", albumIds);

    if (albumsError) {
      console.error("[queries] getUserFavoriteAlbums albumsError:", albumsError);
      return [];
    }

    const cachedAlbumMap = new Map<
      string,
      { id: string; name: string; image_url: string | null }
    >(
      (albums ?? []).map((a) => [
        a.id as string,
        {
          id: a.id as string,
          name: a.name as string,
          image_url: (a.image_url as string | null) ?? null,
        },
      ]),
    );

    // Determine which favorite album IDs are missing from the cache.
    const missingIds = albumIds.filter((id) => !cachedAlbumMap.has(id));

    if (missingIds.length > 0) {
      try {
        // Fetch missing albums from Spotify and upsert into our albums table.
        const spotifyAlbums: SpotifyApi.AlbumObjectFull[] = await getAlbums(
          missingIds,
        );
        for (const a of spotifyAlbums) {
          try {
            await upsertAlbumFromSpotify(
              supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
              a,
            );
            cachedAlbumMap.set(a.id, {
              id: a.id,
              name: a.name,
              image_url: a.images?.[0]?.url ?? null,
            });
          } catch (e) {
            console.error("[queries] getUserFavoriteAlbums upsertAlbumFromSpotify failed:", e);
          }
        }
      } catch (e) {
        console.error("[queries] getUserFavoriteAlbums Spotify fetch failed:", e);
      }
    }

    return rows
      .map((r) => {
        const album = cachedAlbumMap.get(r.album_id as string);
        if (!album) return null;
        return {
          album_id: r.album_id as string,
          position: r.position as number,
          name: album.name,
          image_url: album.image_url,
        };
      })
      .filter((x): x is FavoriteAlbum => x != null);
  } catch (e) {
    console.error("[queries] getUserFavoriteAlbums failed:", e);
    return [];
  }
}

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  /** Optional JSON (e.g. music recommendation display fields). */
  payload?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) return 0;
    return count ?? 0;
  } catch (e) {
    console.error("[queries] countUnreadNotifications failed:", e);
    return 0;
  }
}

export async function getNotifications(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<NotificationRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, actor_user_id, type, entity_type, entity_id, payload, read, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return [];
    return (data ?? []).map((n) => ({ ...(n as Record<string, unknown>), user_id: userId })) as NotificationRow[];
  } catch (e) {
    console.error("[queries] getNotifications failed:", e);
    return [];
  }
}

export async function markNotificationsRead(
  userId: string,
  notificationIds?: string[],
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId);
    if (notificationIds?.length) q = q.in("id", notificationIds);
    await q;
  } catch (e) {
    console.error("[queries] markNotificationsRead failed:", e);
  }
}

export type AchievementRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
};
export type UserAchievementRow = { achievement_id: string; earned_at: string };

export async function getUserAchievements(
  userId: string,
): Promise<{ achievement: AchievementRow; earned_at: string }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: ua, error: uaError } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", userId);
    if (uaError || !ua?.length) return [];
    const ids = (ua as UserAchievementRow[]).map((u) => u.achievement_id);
    const { data: achievements, error: aError } = await supabase
      .from("achievements")
      .select("id, name, description, icon")
      .in("id", ids);
    if (aError || !achievements?.length) return [];
    const aMap = new Map(
      (achievements as AchievementRow[]).map((a) => [a.id, a]),
    );
    return (ua as UserAchievementRow[])
      .map((u) => ({
        achievement: aMap.get(u.achievement_id)!,
        earned_at: u.earned_at,
      }))
      .filter((x) => x.achievement);
  } catch (e) {
    console.error("[queries] getUserAchievements failed:", e);
    return [];
  }
}

export async function grantAchievementsOnListen(userId: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("grant_achievements_on_listen", { p_user_id: userId });
  } catch (e) {
    console.warn("[queries] grantAchievementsOnListen failed:", e);
  }
}

export async function grantAchievementOnReview(userId: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("grant_achievement_on_review", { p_user_id: userId });
  } catch (e) {
    console.warn("[queries] grantAchievementOnReview failed:", e);
  }
}

export async function grantAchievementOnList(userId: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("grant_achievement_on_list", { p_user_id: userId });
  } catch (e) {
    console.warn("[queries] grantAchievementOnList failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Follow graph
// ---------------------------------------------------------------------------

/** Follower user IDs for a user (people who follow them). */
export async function getFollowers(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<{ id: string; follower_id: string }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    const { data, error } = await supabase
      .from("follows")
      .select("id, follower_id")
      .eq("following_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as { id: string; follower_id: string }[];
  } catch (e) {
    console.error("[queries] getFollowers failed:", e);
    return [];
  }
}

/** Following user IDs for a user (people they follow). */
export async function getFollowing(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<{ id: string; following_id: string }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    const { data, error } = await supabase
      .from("follows")
      .select("id, following_id")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as { id: string; following_id: string }[];
  } catch (e) {
    console.error("[queries] getFollowing failed:", e);
    return [];
  }
}

/** Whether viewer follows target. */
export async function isFollowing(
  viewerUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerUserId === targetUserId) return false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewerUserId)
      .eq("following_id", targetUserId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error("[queries] isFollowing failed:", e);
    return false;
  }
}

/** Follower and following counts for a user. */
export async function getFollowCounts(userId: string): Promise<{
  followers_count: number;
  following_count: number;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_follow_counts", {
      p_user_id: userId,
    });
    if (!error && data != null) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === "object" && "followers_count" in row) {
        const r = row as {
          followers_count: unknown;
          following_count: unknown;
        };
        return {
          followers_count: Math.max(0, Number(r.followers_count) || 0),
          following_count: Math.max(0, Number(r.following_count) || 0),
        };
      }
    }
    if (error) {
      console.warn(
        "[queries] get_follow_counts RPC failed, using fallback:",
        error.message,
      );
    }
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", userId),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", userId),
    ]);
    return {
      followers_count: Math.max(0, followersRes.count ?? 0),
      following_count: Math.max(0, followingRes.count ?? 0),
    };
  } catch (e) {
    console.error("[queries] getFollowCounts failed:", e);
    return { followers_count: 0, following_count: 0 };
  }
}

/** Users who follow the given user (followers), ordered by username. */
export async function getFollowerUsers(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<{ id: string; username: string; avatar_url: string | null }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    // We join follows and users to allow ordering by username and pagination at the database level.
    const { data: users, error } = await supabase
      .from("follows")
      .select("users:users!follower_id (id, username, avatar_url)")
      .eq("following_id", userId)
      .order("users(username)", { ascending: true })
      .range(from, to);

    if (error || !users?.length) return [];

    return (
      users as unknown as {
        users: { id: string; username: string; avatar_url: string | null };
      }[]
    )
      .map((row) => row.users)
      .filter((u) => u !== null)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url ?? null,
      }));
  } catch (e) {
    console.error("[queries] getFollowerUsers failed:", e);
    return [];
  }
}

/** Users the given user is following, ordered by username. */
export async function getFollowingUsers(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<{ id: string; username: string; avatar_url: string | null }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const from = offset;
    const to = offset + limit - 1;

    const { data: users, error } = await supabase
      .from("follows")
      .select("users:users!following_id (id, username, avatar_url)")
      .eq("follower_id", userId)
      .order("users(username)", { ascending: true })
      .range(from, to);

    if (error || !users?.length) return [];

    return (
      users as unknown as {
        users: { id: string; username: string; avatar_url: string | null };
      }[]
    )
      .map((row) => row.users)
      .filter((u) => u !== null)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url ?? null,
      }));
  } catch (e) {
    console.error("[queries] getFollowingUsers failed:", e);
    return [];
  }
}

/** Enrich a list of users with is_following status for a viewer. */
export async function enrichUsersWithFollowStatus<T extends { id: string }>(
  users: T[],
  viewerId: string | null,
): Promise<(T & { is_following: boolean })[]> {
  if (!viewerId || users.length === 0) {
    return users.map((u) => ({ ...u, is_following: false }));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: follows, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in(
        "following_id",
        users.map((u) => u.id),
      );

    if (error) {
      console.error("[queries] enrichUsersWithFollowStatus failed:", error);
      return users.map((u) => ({ ...u, is_following: false }));
    }

    const followingSet = new Set((follows ?? []).map((f) => f.following_id));
    return users.map((u) => ({
      ...u,
      is_following: followingSet.has(u.id),
    }));
  } catch (e) {
    console.error("[queries] enrichUsersWithFollowStatus failed:", e);
    return users.map((u) => ({ ...u, is_following: false }));
  }
}

/** Unified helper for fetching a user's follow network with is_following status. */
export async function getFollowListWithStatus(
  userId: string,
  viewerId: string | null,
  type: "followers" | "following",
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 20, offset = 0 } = options;
  const users =
    type === "followers"
      ? await getFollowerUsers(userId, limit, offset)
      : await getFollowingUsers(userId, limit, offset);

  return enrichUsersWithFollowStatus(users, viewerId);
}

const USER_SEARCH_QUERY_MAX_LENGTH = 50;

/** User search by username (ILIKE). Excludes excludeUserId, returns followers_count via RPC when available. */
export async function searchUsers(
  query: string,
  limit = 20,
  excludeUserId: string | null = null,
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    followers_count: number;
  }[]
> {
  try {
    const supabase = await createSupabaseServerClient();
    const sanitized = sanitizeString(query, USER_SEARCH_QUERY_MAX_LENGTH) ?? "";
    if (sanitized.length < 2) return [];

    const cappedLimit = Math.min(Math.max(1, limit), 50);

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_user_search",
      {
        p_query: sanitized,
        p_limit: cappedLimit,
        p_exclude_user_id: excludeUserId || null,
      },
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return (
        rpcData as {
          id: string;
          username: string;
          avatar_url: string | null;
          followers_count: number;
        }[]
      ).map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar_url ?? null,
        followers_count: Number(r.followers_count) || 0,
      }));
    }

    if (rpcError) {
      console.warn(
        "[queries] get_user_search RPC failed (migration 019 may not be applied), using fallback:",
        rpcError.message,
      );
    }

    let q = supabase
      .from("users")
      .select("id, username, avatar_url")
      .ilike("username", `%${sanitized}%`)
      .order("username", { ascending: true })
      .limit(cappedLimit);
    if (excludeUserId) q = q.neq("id", excludeUserId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url ?? null,
      followers_count: 0,
    }));
  } catch (e) {
    console.error("[queries] searchUsers failed:", e);
    return [];
  }
}

/** Oldest signups first (for browse-before-search). Uses `list_users_by_created` RPC (migration 080). */
export async function listUsersByCreatedAt(
  limit = 10,
  offset = 0,
  excludeUserId: string | null = null,
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    followers_count: number;
  }[]
> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);
    const { data, error } = await supabase.rpc("list_users_by_created", {
      p_limit: cappedLimit,
      p_offset: safeOffset,
      p_exclude_user_id: excludeUserId || null,
    });
    if (!error && Array.isArray(data)) {
      return (
        data as {
          id: string;
          username: string;
          avatar_url: string | null;
          followers_count: number;
        }[]
      ).map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar_url ?? null,
        followers_count: Number(r.followers_count) || 0,
      }));
    }
    if (error) {
      console.warn(
        "[queries] list_users_by_created RPC failed (migration 080), using fallback:",
        error.message,
      );
    }
    let q = supabase
      .from("users")
      .select("id, username, avatar_url")
      .order("created_at", { ascending: true })
      .range(safeOffset, safeOffset + cappedLimit - 1);
    if (excludeUserId) q = q.neq("id", excludeUserId);
    const { data: rows, error: qerr } = await q;
    if (qerr) throw qerr;
    return (rows ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url ?? null,
      followers_count: 0,
    }));
  } catch (e) {
    console.error("[queries] listUsersByCreatedAt failed:", e);
    return [];
  }
}

/** Suggested users: by follower count (most followers first), exclude self and already followed. Limit 10. Uses DB RPC (migration 018). */
export async function getSuggestedUsers(
  userId: string,
  limit = 10,
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    followers_count: number;
  }[]
> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(limit, 1), 100);

    const { data: rows, error } = await supabase.rpc("get_suggested_users", {
      p_user_id: userId,
      p_limit: cappedLimit,
    });

    if (error) {
      console.warn(
        "[queries] get_suggested_users RPC failed (migration 018 may not be applied):",
        error.message,
      );
      return [];
    }

    return (rows ?? []).map(
      (r: {
        id: string;
        username: string;
        avatar_url: string | null;
        followers_count: number;
      }) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar_url ?? null,
        followers_count: Number(r.followers_count) || 0,
      }),
    );
  } catch (e) {
    console.error("[queries] getSuggestedUsers failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Social feed (reviews + follow activity)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use getActivityFeed for the unified feed (reviews + follows). Kept for backward compatibility.
 * Fetch recent reviews from followed users (IN-list query).
 */
export async function getReviewFeed(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: followings, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .limit(500);

    if (followError) throw followError;

    const followingIds = (followings ?? [])
      .map((f) => f.following_id)
      .slice(0, 500);
    if (followingIds.length === 0) return [];

    const cappedLimit = Math.min(limit, 100);
    const from = offset;
    const to = offset + cappedLimit - 1;

    const { data: rows, error: reviewsError } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("user_id", followingIds)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (reviewsError) throw reviewsError;
    if (!rows?.length) return [];

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: userMap.get(r.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getReviewFeed failed:", e);
    return [];
  }
}

export type ActivityFeedPage = {
  items: FeedActivity[];
  next_cursor: string | null;
};

export type FeedListenSessionRow = {
  type: string;
  user_id: string;
  track_id: string;
  album_id: string;
  track_name: string | null;
  artist_name: string | null;
  song_count: number;
  first_listened_at: string;
  created_at: string;
};

/** Fetch listen sessions for the feed (track-level, 30-min bucket). Returns [] if RPC missing. */
export async function getFeedListenSessions(
  followerId: string,
  limit: number,
  cursor?: string | null,
): Promise<FeedListenSessionRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const capped = Math.min(Math.max(1, limit), 100);
    const { data, error } = await supabase.rpc("get_feed_listen_sessions", {
      p_follower_id: followerId,
      p_cursor: cursor ?? null,
      p_limit: capped,
    });
    if (error) {
      console.warn(
        "[queries] get_feed_listen_sessions RPC failed (migration 023 may not be applied):",
        error.message,
      );
      return [];
    }
    return (data ?? []).map(
      (r: {
        type: string;
        user_id: string;
        track_id: string;
        album_id: string;
        track_name: string | null;
        artist_name: string | null;
        song_count: number;
        first_listened_at: string;
        created_at: string;
      }) => ({
        type: r.type,
        user_id: r.user_id,
        track_id: r.track_id,
        album_id: r.album_id,
        track_name: r.track_name ?? null,
        artist_name: r.artist_name ?? null,
        song_count: Number(r.song_count) || 0,
        first_listened_at: r.first_listened_at,
        created_at: r.created_at,
      }),
    );
  } catch (e) {
    console.error("[queries] getFeedListenSessions failed:", e);
    return [];
  }
}

/**
 * Activity feed: reviews, follows, and listen sessions.
 *
 * Listen sessions (get_feed_listen_sessions):
 * - Source: `logs` from users you follow (last 7 days), track-level (migration 056+).
 * - Grouped by: user_id, track_id, 30-min bucket; max 3 per user per hour.
 * - Merge: priority sort (reviews > follows > listens), then collapse consecutive same-user into "N songs" with expand showing up to 10 songs.
 */
export async function getActivityFeed(
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const fetchLimit = cappedLimit * 2;

    const cursorTs = cursor ? (cursor as string) : null;

    const [reviewsRes, followsRes, listenSessions] = await Promise.all([
      supabase.rpc("get_feed_reviews", {
        p_follower_id: userId,
        p_cursor: cursorTs,
        p_limit: fetchLimit,
      }),
      supabase.rpc("get_feed_follows", {
        p_follower_id: userId,
        p_cursor: cursorTs,
        p_limit: fetchLimit,
      }),
      getFeedListenSessions(userId, fetchLimit, cursorTs),
    ]);

    if (reviewsRes.error) {
      console.warn(
        "[queries] get_feed_reviews RPC failed (migration 017 may not be applied), using fallback",
        reviewsRes.error,
      );
      return getActivityFeedFallback(userId, cappedLimit, cursor);
    }
    if (followsRes.error) {
      console.warn(
        "[queries] get_feed_follows RPC failed (migration 017 may not be applied), using fallback",
        followsRes.error,
      );
      return getActivityFeedFallback(userId, cappedLimit, cursor);
    }

    const reviewRows = (reviewsRes.data ?? []) as {
      id: string;
      user_id: string;
      entity_type: string;
      entity_id: string;
      rating: number;
      review_text: string | null;
      created_at: string;
      updated_at: string;
    }[];
    const followRows = (followsRes.data ?? []) as {
      id: string;
      follower_id: string;
      following_id: string;
      created_at: string;
    }[];

    const userIds = new Set<string>();
    reviewRows.forEach((r) => userIds.add(r.user_id));
    followRows.forEach((f) => {
      userIds.add(f.follower_id);
      userIds.add(f.following_id);
    });
    listenSessions.forEach((s) => userIds.add(s.user_id));
    const userMap = await fetchUserMap(supabase, [...userIds]);

    const reviewActivities: FeedActivity[] = (reviewRows as unknown as Record<string, unknown>[]).map((r) => ({
      type: "review",
      created_at: r.created_at as string,
      review: {
        id: r.id as string,
        user_id: r.user_id as string,
        entity_type: r.entity_type as "album" | "song",
        entity_id: r.entity_id as string,
        rating: r.rating as number,
        review_text: (r.review_text as string) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        user: userMap.get(r.user_id as string) ?? null,
      },
    }));

    const followActivities: FeedActivity[] = followRows.map((f) => ({
      type: "follow",
      id: f.id,
      created_at: f.created_at,
      follower_id: f.follower_id,
      following_id: f.following_id,
      follower_username: userMap.get(f.follower_id)?.username ?? null,
      following_username: userMap.get(f.following_id)?.username ?? null,
    }));

    const listenActivities: FeedActivity[] = listenSessions.map((s) => ({
      type: "listen_session" as const,
      user_id: s.user_id,
      track_id: s.track_id,
      album_id: s.album_id,
      song_count: s.song_count,
      first_listened_at: s.first_listened_at,
      created_at: s.created_at,
      user: userMap.get(s.user_id) ?? null,
      track_name: s.track_name ?? null,
      artist_name: s.artist_name ?? null,
    }));

    // Priority ranking: reviews > follows > listens when times are close
    const PRIORITY_BONUS_MS = {
      review: 0,
      follow: 30 * 60 * 1000,
      listen: 2 * 60 * 60 * 1000,
    };
    const sortKey = (item: FeedActivity): number => {
      const t = new Date(item.created_at).getTime();
      if (item.type === "review") return t - PRIORITY_BONUS_MS.review;
      if (item.type === "follow") return t - PRIORITY_BONUS_MS.follow;
      return t - PRIORITY_BONUS_MS.listen;
    };
    const merged = [
      ...reviewActivities,
      ...followActivities,
      ...listenActivities,
    ].sort((a, b) => sortKey(b) - sortKey(a));

    // Collapse consecutive listen_sessions from same user into "N songs" with up to 10 in expand
    const collapsed: FeedActivity[] = [];
    let i = 0;
    while (i < merged.length) {
      const item = merged[i];
      if (item.type !== "listen_session") {
        collapsed.push(item);
        i++;
        continue;
      }
      const run: FeedActivity[] = [item];
      while (
        i + 1 < merged.length &&
        merged[i + 1].type === "listen_session" &&
        (merged[i + 1] as FeedListenSession).user_id === item.user_id
      ) {
        run.push(merged[i + 1] as FeedListenSession);
        i++;
      }
      i++;
      if (run.length === 1) {
        collapsed.push(run[0]);
      } else {
        const latest = run.reduce(
          (best, r) => (r.created_at > best.created_at ? r : best),
          run[0] as FeedListenSession,
        );
        collapsed.push({
          type: "listen_sessions_summary",
          user_id: item.user_id,
          song_count: run.length,
          created_at: latest.created_at,
          user: (item as FeedListenSession).user ?? null,
          sessions: run.slice(0, 10) as FeedListenSession[],
        });
      }
    }

    const items = collapsed.slice(0, cappedLimit);
    const next_cursor =
      items.length === cappedLimit ? items[items.length - 1].created_at : null;

    return { items, next_cursor };
  } catch (e) {
    console.error("[queries] getActivityFeed failed:", e);
    return getActivityFeedFallback(userId, Math.min(limit, 100), cursor);
  }
}

/** Fallback when migration 017 is not applied (e.g. local/dev). Uses IN-list + cursor. */
async function getActivityFeedFallback(
  userId: string,
  limit: number,
  cursor: string | null,
): Promise<ActivityFeedPage> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: followings, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .limit(500);
    if (followError) throw followError;

    const followingIds = (followings ?? [])
      .map((f) => f.following_id)
      .slice(0, 500);
    if (followingIds.length === 0) return { items: [], next_cursor: null };

    const fetchLimit = limit * 2;

    let reviewsQuery = supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("user_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    if (cursor) reviewsQuery = reviewsQuery.lt("created_at", cursor);

    let followsQuery = supabase
      .from("follows")
      .select("id, follower_id, following_id, created_at")
      .in("follower_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    if (cursor) followsQuery = followsQuery.lt("created_at", cursor);

    const [reviewsRes, followsRes] = await Promise.all([
      reviewsQuery,
      followsQuery,
    ]);

    if (reviewsRes.error) throw reviewsRes.error;
    if (followsRes.error) throw followsRes.error;

    const reviewRows = reviewsRes.data ?? [];
    const followRows = (followsRes.data ?? []) as {
      id: string;
      follower_id: string;
      following_id: string;
      created_at: string;
    }[];

    const userIds = new Set<string>();
    reviewRows.forEach((r) => userIds.add(r.user_id));
    followRows.forEach((f) => {
      userIds.add(f.follower_id);
      userIds.add(f.following_id);
    });
    const userMap = await fetchUserMap(supabase, [...userIds]);

    const reviewActivities: FeedActivity[] = (reviewRows as unknown as Record<string, unknown>[]).map((r) => ({
      type: "review",
      created_at: r.created_at as string,
      review: {
        id: r.id as string,
        user_id: r.user_id as string,
        entity_type: r.entity_type as "album" | "song",
        entity_id: r.entity_id as string,
        rating: r.rating as number,
        review_text: (r.review_text as string) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        user: userMap.get(r.user_id as string) ?? null,
      },
    }));

    const followActivities: FeedActivity[] = followRows.map((f) => ({
      type: "follow",
      id: f.id,
      created_at: f.created_at,
      follower_id: f.follower_id,
      following_id: f.following_id,
      follower_username: userMap.get(f.follower_id)?.username ?? null,
      following_username: userMap.get(f.following_id)?.username ?? null,
    }));

    const merged = [...reviewActivities, ...followActivities].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const items = merged.slice(0, limit);
    const next_cursor =
      items.length === limit ? items[items.length - 1].created_at : null;

    return { items, next_cursor };
  } catch (e) {
    console.error("[queries] getActivityFeedFallback failed:", e);
    return { items: [], next_cursor: null };
  }
}

/** Profile activity: reviews and follow events by this user (no passive logs). */
export async function getProfileActivity(
  userId: string,
  limit = 30,
): Promise<FeedActivity[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const [reviewsRes, followsRes] = await Promise.all([
      supabase
        .from("reviews")
        .select(
          "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("follows")
        .select("id, follower_id, following_id, created_at")
        .eq("follower_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (reviewsRes.error) throw reviewsRes.error;
    if (followsRes.error) throw followsRes.error;

    const reviewRows = reviewsRes.data ?? [];
    const followRows = (followsRes.data ?? []) as {
      id: string;
      follower_id: string;
      following_id: string;
      created_at: string;
    }[];

    const userIds = new Set<string>([userId]);
    followRows.forEach((f) => userIds.add(f.following_id));
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", [...userIds]);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const reviewActivities: FeedActivity[] = reviewRows.map((r) => ({
      type: "review",
      created_at: r.created_at,
      review: {
        id: r.id,
        user_id: r.user_id,
        entity_type: r.entity_type as "album" | "song",
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: userMap.get(r.user_id) ?? null,
      },
    }));

    const followActivities: FeedActivity[] = followRows.map((f) => ({
      type: "follow",
      id: f.id,
      created_at: f.created_at,
      follower_id: f.follower_id,
      following_id: f.following_id,
      follower_username: userMap.get(f.follower_id)?.username ?? null,
      following_username: userMap.get(f.following_id)?.username ?? null,
    }));

    const merged = [...reviewActivities, ...followActivities].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return merged.slice(0, limit);
  } catch (e) {
    console.error("[queries] getProfileActivity failed:", e);
    return [];
  }
}

/** Batch-fetch display names for review entities from songs and albums tables. */
export async function getEntityDisplayNames(
  items: { entity_type: "album" | "song"; entity_id: string }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const songIds = items
    .filter((i) => i.entity_type === "song")
    .map((i) => i.entity_id);
  const albumIds = items
    .filter((i) => i.entity_type === "album")
    .map((i) => i.entity_id);

  const supabase = await createSupabaseServerClient();

  if (songIds.length > 0) {
    const { data: songs } = await supabase
      .from("tracks")
      .select("id, name")
      .in("id", songIds);
    for (const s of songs ?? []) {
      if (s.name) map.set(s.id, s.name);
    }
  }
  if (albumIds.length > 0) {
    const { data: albums } = await supabase
      .from("albums")
      .select("id, name")
      .in("id", albumIds);
    for (const a of albums ?? []) {
      if (a.name) map.set(a.id, a.name);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// User lists (curated albums/songs)
// ---------------------------------------------------------------------------

export type ListRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: "album" | "song";
  visibility: "public" | "friends" | "private";
  emoji: string | null;
  image_url: string | null;
  created_at: string;
};

export type ListItemRow = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
};

export type UserListSummary = {
  id: string;
  title: string;
  description: string | null;
  type: "album" | "song";
  visibility: "public" | "friends" | "private";
  emoji: string | null;
  image_url: string | null;
  created_at: string;
  item_count: number;
};

export type UserListWithPreview = UserListSummary & {
  /** First few item titles (album or track names) for profile cards */
  preview_labels: string[];
};

async function getListItemCountsMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  listIds: string[],
): Promise<Map<string, number>> {
  const countByList = new Map<string, number>();
  if (listIds.length === 0) return countByList;

  const { data: countData, error: countError } = await supabase.rpc(
    "get_list_item_counts",
    { p_list_ids: listIds },
  );

  if (countError) {
    const { data: itemRows, error: itemRowsError } = await supabase
      .from("list_items")
      .select("list_id")
      .in("list_id", listIds);

    if (itemRowsError) {
      console.error("[queries] list item counts fallback failed:", itemRowsError);
    } else {
      for (const row of (itemRows ?? []) as { list_id: string }[]) {
        const key = row.list_id;
        countByList.set(key, (countByList.get(key) ?? 0) + 1);
      }
    }
    return countByList;
  }

  for (const row of (countData ?? []) as {
    list_id: string;
    item_count: number;
  }[]) {
    countByList.set(row.list_id, Number(row.item_count) || 0);
  }
  return countByList;
}

export async function getUserLists(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<UserListSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const cappedOffset = Math.max(0, offset);

    const { data: listRows, error: listError } = await supabase
      .from("lists")
      .select(
        "id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(cappedOffset, cappedOffset + cappedLimit - 1);

    if (listError) throw listError;
    if (!listRows?.length) return [];

    const listIds = listRows.map((l) => l.id);
    const countByList = await getListItemCountsMap(supabase, listIds);

    return listRows.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description ?? null,
      type: l.type as "album" | "song",
      visibility:
        (l.visibility as "public" | "friends" | "private") ?? "private",
      emoji: (l.emoji as string | null) ?? null,
      image_url: (l.image_url as string | null) ?? null,
      created_at: l.created_at,
      item_count: countByList.get(l.id) ?? 0,
    }));
  } catch (e) {
    console.error("[queries] getUserLists failed:", e);
    return [];
  }
}

/** Lists with up to four preview titles from list_items (album/song names). */
export async function getUserListsWithPreviews(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<UserListWithPreview[]> {
  const lists = await getUserLists(userId, limit, offset);
  if (lists.length === 0) return [];

  try {
    const supabase = await createSupabaseServerClient();
    const listIds = lists.map((l) => l.id);

    const { data: itemRows, error: itemErr } = await supabase
      .from("list_items")
      .select("list_id, entity_type, entity_id, position")
      .in("list_id", listIds);

    if (itemErr || !itemRows?.length) {
      return lists.map((l) => ({ ...l, preview_labels: [] }));
    }

    type ItemRow = {
      list_id: string;
      entity_type: string;
      entity_id: string;
      position: number | null;
    };

    const byList = new Map<string, ItemRow[]>();
    for (const r of itemRows as ItemRow[]) {
      const arr = byList.get(r.list_id) ?? [];
      arr.push(r);
      byList.set(r.list_id, arr);
    }
    for (const arr of byList.values()) {
      arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    const albumIds = new Set<string>();
    const songIds = new Set<string>();
    for (const listId of listIds) {
      for (const r of (byList.get(listId) ?? []).slice(0, 4)) {
        if (r.entity_type === "album") albumIds.add(r.entity_id);
        else if (r.entity_type === "song") songIds.add(r.entity_id);
      }
    }

    const albumNames = new Map<string, string>();
    const songNames = new Map<string, string>();

    const idChunks = <T>(ids: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < ids.length; i += size)
        out.push(ids.slice(i, i + size));
      return out;
    };

    const albumParts = idChunks([...albumIds], 100);
    const songParts = idChunks([...songIds], 100);
    const [albumRowsList, songRowsList] = await Promise.all([
      Promise.all(
        albumParts.map((part) =>
          supabase.from("albums").select("id, name").in("id", part),
        ),
      ),
      Promise.all(
        songParts.map((part) =>
          supabase.from("tracks").select("id, name").in("id", part),
        ),
      ),
    ]);
    for (const { data: albums } of albumRowsList) {
      for (const a of albums ?? []) {
        albumNames.set(a.id as string, a.name as string);
      }
    }
    for (const { data: songs } of songRowsList) {
      for (const s of songs ?? []) {
        songNames.set(s.id as string, s.name as string);
      }
    }

    return lists.map((list) => {
      const rows = (byList.get(list.id) ?? []).slice(0, 4);
      const preview_labels: string[] = [];
      for (const r of rows) {
        if (r.entity_type === "album") {
          const n = albumNames.get(r.entity_id);
          if (n) preview_labels.push(n);
        } else if (r.entity_type === "song") {
          const n = songNames.get(r.entity_id);
          if (n) preview_labels.push(n);
        }
      }
      return { ...list, preview_labels };
    });
  } catch (e) {
    console.error("[queries] getUserListsWithPreviews failed:", e);
    return lists.map((l) => ({ ...l, preview_labels: [] as string[] }));
  }
}

export type ListWithItems = {
  list: ListRow;
  items: ListItemRow[];
  owner_username: string | null;
};

export async function getList(
  listId: string,
  limit = 100,
  offset = 0,
): Promise<ListWithItems | null> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: listRow, error: listError } = await supabase
      .from("lists")
      .select(
        "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .eq("id", listId)
      .maybeSingle();

    if (listError || !listRow) return null;

    let itemRows:
      | {
          id: string;
          list_id: string;
          entity_type: string;
          entity_id: string;
          position: number;
          added_at?: string;
        }[]
      | null = null;
    let itemsError: { code?: string } | null = null;

    const from = offset;
    const to = offset + limit - 1;

    const itemsResult = await supabase
      .from("list_items")
      .select("id, entity_type, entity_id, position, added_at")
      .eq("list_id", listId)
      .order("position", { ascending: true })
      .range(from, to);
    itemRows = (itemsResult.data ?? []).map((r: any) => ({ ...r, list_id: listId }));
    itemsError = itemsResult.error;

    // If column missing (e.g. added_at), retry with minimal columns and default added_at.
    if (itemsError?.code === "42703") {
      const fallback = await supabase
        .from("list_items")
        .select("id, list_id, entity_type, entity_id, position")
        .eq("list_id", listId)
        .order("position", { ascending: true })
        .range(from, to);
      if (!fallback.error) {
        itemRows = (fallback.data ?? []).map((r) => ({
          ...r,
          added_at: new Date().toISOString(),
        }));
        itemsError = null;
      }
    }

    const safeItemRows = itemsError ? [] : (itemRows ?? []);
    if (itemsError) {
      console.error("[queries] getList itemsError:", itemsError);
    }

    const { data: owner } = await supabase
      .from("users")
      .select("username")
      .eq("id", listRow.user_id)
      .maybeSingle();

    return {
      list: listRow as ListRow,
      items: safeItemRows as ListItemRow[],
      owner_username: owner?.username ?? null,
    };
  } catch (e) {
    console.error("[queries] getList failed:", e);
    return null;
  }
}

export async function createList(
  userId: string,
  title: string,
  description: string | null = null,
  type: "album" | "song" = "album",
  visibility: "public" | "friends" | "private" = "private",
): Promise<ListRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lists")
      .insert({
        user_id: userId,
        title,
        description: description || null,
        type,
        visibility,
        emoji: null,
        image_url: null,
      })
      .select(
        "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .single();

    if (error) throw error;
    return data as ListRow;
  } catch (e) {
    console.error("[queries] createList failed:", e);
    return null;
  }
}

export async function addListItem(
  listId: string,
  entityType: "album" | "song",
  entityId: string,
): Promise<ListItemRow | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // Enforce list type: items must match the list's type.
    const { data: listRow, error: listError } = await supabase
      .from("lists")
      .select("type")
      .eq("id", listId)
      .maybeSingle();
    if (listError || !listRow) {
      throw listError || new Error("List not found");
    }
    const listType = (listRow.type ?? "album") as "album" | "song";
    if (entityType !== listType) {
      throw new Error("Item type does not match list type");
    }

    const { data: maxRow } = await supabase
      .from("list_items")
      .select("position")
      .eq("list_id", listId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = maxRow?.position != null ? maxRow.position + 1 : 0;

    const insertResult = await supabase
      .from("list_items")
      .insert({
        list_id: listId,
        entity_type: entityType,
        entity_id: entityId,
        position: nextPosition,
      })
      .select("id, list_id, entity_type, entity_id, position, added_at")
      .single();

    if (!insertResult.error) {
      return insertResult.data as ListItemRow;
    }
    if (insertResult.error.code === "42703") {
      const fallback = await supabase
        .from("list_items")
        .select("id, list_id, entity_type, entity_id, position")
        .eq("list_id", listId)
        .eq("position", nextPosition)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!fallback.error && fallback.data) {
        return {
          ...fallback.data,
          added_at: new Date().toISOString(),
        } as ListItemRow;
      }
    }
    throw insertResult.error;
  } catch (e) {
    console.error("[queries] addListItem failed:", e);
    return null;
  }
}

/** Delete list item; returns true only if the item belonged to listId. */
export async function removeListItem(
  itemId: string,
  listId?: string,
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    if (listId) {
      const { data, error: fetchError } = await supabase
        .from("list_items")
        .select("id")
        .eq("id", itemId)
        .eq("list_id", listId)
        .maybeSingle();
      if (fetchError || !data) return false;
    }
    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", itemId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("[queries] removeListItem failed:", e);
    return false;
  }
}

/** Search lists by title (public). Returns list summary + owner_username. */
export type ListSearchResult = {
  id: string;
  title: string;
  description: string | null;
  type: "album" | "song";
  created_at: string;
  item_count: number;
  owner_username: string | null;
};

export async function searchLists(
  query: string,
  limit = 20,
): Promise<ListSearchResult[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const sanitized = sanitizeString(query, 100) ?? "";
    const cappedLimit = Math.min(Math.max(1, limit), 50);

    if (sanitized.length < 2) return [];

    const { data: listRows, error: listError } = await supabase
      .from("lists")
      .select("id, user_id, title, description, type, created_at")
      .ilike("title", `%${sanitized}%`)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (listError) throw listError;
    if (!listRows?.length) return [];

    const userIds = [...new Set(listRows.map((l) => l.user_id))];
    const userMap = await fetchUserMap<{ id: string; username: string }>(
      supabase,
      userIds,
      "id, username"
    );

    const listIds = listRows.map((l) => l.id);
    const countByList = await getListItemCountsMap(supabase, listIds);

    return listRows.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description ?? null,
      type: l.type as "album" | "song",
      created_at: l.created_at,
      item_count: countByList.get(l.id) ?? 0,
      owner_username: userMap.get(l.user_id)?.username ?? null,
    }));
  } catch (e) {
    console.error("[queries] searchLists failed:", e);
    return [];
  }
}

/** Check if the user owns the list (for API auth). */
export async function getListOwnerId(listId: string): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lists")
      .select("user_id")
      .eq("id", listId)
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id;
  } catch (e) {
    console.error("[queries] getListOwnerId failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Discovery (trending, rising artists, hidden gems)
// ---------------------------------------------------------------------------

export async function getTrendingEntities(
  limit = 20,
): Promise<TrendingEntity[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const capped = Math.min(Math.max(1, limit), 50);
    const { data, error = null } = await supabase.rpc("get_trending_entities", {
      p_limit: capped,
    });
    if (error) {
      console.warn(
        "[queries] get_trending_entities RPC failed (migration 021):",
        error.message,
      );
      return [];
    }
    return (data ?? []).map((r: { entity_id: string; entity_type: string; listen_count: number }) => ({
      entity_id: r.entity_id,
      entity_type: r.entity_type ?? "song",
      listen_count: Number(r.listen_count) || 0,
    }));
  } catch (e) {
    console.error("[queries] getTrendingEntities failed:", e);
    return [];
  }
}

export async function getRisingArtists(
  limit = 20,
  windowDays = 7,
): Promise<RisingArtist[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const cappedWindow = Math.min(Math.max(1, windowDays), 90);
    const { data, error = null } = await supabase.rpc("get_rising_artists", {
      p_limit: cappedLimit,
      p_window_days: cappedWindow,
    });
    if (error) {
      console.warn(
        "[queries] get_rising_artists RPC failed (migration 021):",
        error.message,
      );
      return [];
    }
    return (data ?? []).map((r: { artist_id: string; name: string; avatar_url: string | null; growth: number }) => ({
      artist_id: r.artist_id,
      name: r.name ?? "",
      avatar_url: r.avatar_url ?? null,
      growth: Number(r.growth) || 0,
    }));
  } catch (e) {
    console.error("[queries] getRisingArtists failed:", e);
    return [];
  }
}

export async function getHiddenGems(
  limit = 20,
  minRating = 4,
  maxListens = 50,
): Promise<HiddenGem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const { data, error = null } = await supabase.rpc("get_hidden_gems", {
      p_limit: cappedLimit,
      p_min_rating: minRating,
      p_max_listens: maxListens,
    });
    if (error) {
      console.warn(
        "[queries] get_hidden_gems RPC failed (migration 021):",
        error.message,
      );
      return [];
    }
    return (data ?? []).map((r: { entity_id: string; entity_type: string; avg_rating: number; listen_count: number }) => ({
      entity_id: r.entity_id,
      entity_type: r.entity_type ?? "song",
      avg_rating: Number(r.avg_rating) || 0,
      listen_count: Number(r.listen_count) || 0,
    }));
  } catch (e) {
    console.error("[queries] getHiddenGems failed:", e);
    return [];
  }
}
