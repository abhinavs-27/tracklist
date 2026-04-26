import "server-only";

import { getSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAlbums } from "@/lib/spotify";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { upsertAlbumFromSpotify } from "@/lib/spotify-cache";
import {
  getTrackIdByExternalId,
  resolveCanonicalAlbumUuidFromEntityId,
  resolveCanonicalArtistUuidFromEntityId,
  resolveCanonicalTrackUuidFromEntityId,
} from "@/lib/catalog/entity-resolution";
import {
  defaultRatingDistribution,
  normalizeRatingDistribution,
  ratingDistributionKey,
} from "@/lib/ratings";
import {
  buildActivityFeedFromLegacyRows,
  tryHomeFeedLegacyBundle,
  type FeedFollowRpcRow,
  type FeedListenSessionRow,
  type FeedReviewRpcRow,
} from "@/lib/feed/legacy-feed-bundle";
import {
  albumPagePhaseEnd,
  albumPagePhaseError,
  albumPagePhaseStart,
} from "@/lib/album-page-load-log";
import { isArtistPageDebugEnabled } from "@/lib/artist-page-load-log";
import {
  isValidLfmCatalogId,
  isValidSpotifyId,
  isValidUuid,
  sanitizeString,
} from "@/lib/validation";
import { listUsersByCreatedAtWithClient } from "@/lib/user-search-directory";
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

/**
 * Fetch a single user summary (id, username, avatar_url).
 */
export async function fetchUserSummary(
  userId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ id: string; username: string; avatar_url: string | null } | null> {
  const sb = supabase ?? (await createSupabaseServerClient());
  const { data, error } = await sb
    .from("users")
    .select("username, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: userId,
    username: data.username,
    avatar_url: data.avatar_url ?? null,
  };
}

/**
 * Batch-fetch user summaries and return as a Map.
 */
export async function fetchUserSummaryMap(
  userIds: string[],
): Promise<Map<string, { id: string; username: string; avatar_url: string | null }>> {
  const supabase = await createSupabaseServerClient();
  return fetchUserMap(supabase, userIds, "id, username, avatar_url");
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
  viewerUserId?: string | null,
): Promise<ListenLogWithUser[]> {
  const raw = await getListenLogsInternal({
    spotifyTrackId,
    limit: Math.max(limit * 5, 50),
    offset,
    viewerUserId,
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
  /** When listing logs for a track, exclude users with `logs_private` unless this is the viewer. */
  viewerUserId?: string | null;
}): Promise<ListenLogWithUser[]> {
  try {
    const supabase = await createSupabaseServerClient();

    const from = opts.offset ?? 0;
    const to = from + opts.limit - 1;

    const selectFields = ["id", "listened_at", "source", "created_at"];
    // user_id and track_id are omitted if already filtered by equality to reduce payload size.
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

    let logs = rawLogs.map((l: any) => ({
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

    if (opts.spotifyTrackId && logs.length) {
      const uidList = [...new Set(logs.map((l) => l.user_id))];
      const { data: privRows } = await supabase
        .from("users")
        .select("id, logs_private")
        .in("id", uidList);
      const hidden = new Set(
        (privRows ?? [])
          .filter((u) => {
            const row = u as { id: string; logs_private?: boolean | null };
            if (!row.logs_private) return false;
            if (opts.viewerUserId && row.id === opts.viewerUserId) return false;
            return true;
          })
          .map((u) => (u as { id: string }).id),
      );
      logs = logs.filter((l) => !hidden.has(l.user_id));
    }

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

type ReviewLikeStat = { like_count: number; viewer_has_liked: boolean };

async function fetchReviewLikeStatsMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  reviewIds: string[],
  viewerId: string | null,
): Promise<Map<string, ReviewLikeStat>> {
  const map = new Map<string, ReviewLikeStat>();
  if (reviewIds.length === 0) return map;

  const { data, error } = await supabase.rpc("get_review_like_stats", {
    p_review_ids: reviewIds,
    p_viewer_id: viewerId,
  });

  if (error) {
    console.error("[queries] get_review_like_stats failed:", error);
    return map;
  }

  for (const row of data ?? []) {
    const r = row as {
      review_id: string;
      like_count: number | string;
      viewer_liked: boolean;
    };
    map.set(r.review_id, {
      like_count: Number(r.like_count),
      viewer_has_liked: Boolean(r.viewer_liked),
    });
  }
  return map;
}

/** Reviews for an entity. Capped at 20 for performance. */
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ReviewsResult | null> {
  const cappedLimit = Math.min(Math.max(1, limit), 20);
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalEntityId =
      entityType === "album"
        ? await resolveCanonicalAlbumUuidFromEntityId(sb, entityId)
        : await resolveCanonicalTrackUuidFromEntityId(sb, entityId);
    if (!canonicalEntityId) {
      return {
        reviews: [],
        average_rating: null,
        count: 0,
        my_review: null,
      };
    }

    const reviewsPromise = sb
      .from("reviews")
      .select("id, user_id, rating, review_text, created_at, updated_at")
      .eq("entity_type", entityType)
      .eq("entity_id", canonicalEntityId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    const sessionPromise = getSession();

    const countPromise = sb
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", canonicalEntityId);

    const [reviewsRes, session, countRes] = await Promise.all([
      reviewsPromise,
      sessionPromise,
      countPromise,
    ]);

    if (reviewsRes.error) return null;

    const userId = session?.user?.id ?? null;
    const reviewRows = reviewsRes.data ?? [];

    const myRowPromise = userId
      ? sb
          .from("reviews")
          .select("id, rating, review_text, created_at, updated_at")
          .eq("entity_type", entityType)
          .eq("entity_id", canonicalEntityId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null });

    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const userMapPromise = fetchUserMap(sb, userIds);

    const [myRowRes, userMap] = await Promise.all([
      myRowPromise,
      userMapPromise,
    ]);

    const myRow = myRowRes.data;

    const reviewIdsForLikes = [
      ...new Set(
        [...reviewRows.map((r) => r.id), ...(myRow ? [myRow.id] : [])].filter(
          Boolean,
        ),
      ),
    ];
    const likeStatMap = await fetchReviewLikeStatsMap(
      sb,
      reviewIdsForLikes,
      userId,
    );

    const reviews: ReviewWithUser[] = reviewRows.map((r) => {
      const u = userMap.get(r.user_id);
      const ls = likeStatMap.get(r.id);
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
        like_count: ls?.like_count ?? 0,
        viewer_has_liked: ls?.viewer_has_liked ?? false,
        user: u
          ? { id: u.id, username: u.username, avatar_url: u.avatar_url ?? null }
          : null,
      };
    });

    const count = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const average_rating =
      count > 0 ? Math.round((sum / count) * 10) / 10 : null;

    const total_count = countRes.count;

    let my_review: ReviewWithUser | null = null;
    if (userId && myRow) {
      const sessionUsername =
        (session?.user as { username?: string } | undefined)?.username ??
        null;
      const ls = likeStatMap.get(myRow.id);
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
        like_count: ls?.like_count ?? 0,
        viewer_has_liked: ls?.viewer_has_liked ?? false,
      };
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ReviewWithUser[]> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const from = offset;
    const to = offset + limit - 1;

    const { data: rows, error } = await sb
      .from("reviews")
      .select(
        "id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !rows?.length) return [];

    const { data: users } = await sb
      .from("users")
      .select("username, avatar_url")
      .eq("id", userId);

    const user = users?.[0] ? { id: userId, ...users[0] } : null;

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
  /** Count of reviews per half-star step (string keys for JSONB: "1", "1.5", … "5"). */
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
  /** Canonical `albums.id` or `tracks.id` UUID. */
  canonicalEntityId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<EntityStats> {
  const albumLiveT0 =
    entityType === "album"
      ? albumPagePhaseStart("getEntityStatsLive(album)", canonicalEntityId)
      : null;

  const sb = supabase ?? (await createSupabaseServerClient());

  let listen_count = 0;
  if (entityType === "song") {
    const { data, error } = await sb.rpc("count_logs_by_track_ids", {
      p_track_ids: [canonicalEntityId],
    });
    if (!error && data?.length) {
      listen_count = Number(data[0].play_count) || 0;
    } else {
      const { count } = await sb
        .from("logs")
        .select("id", { count: "exact", head: true })
        .eq("track_id", canonicalEntityId)
        .limit(1);
      listen_count = count ?? 0;
    }
  } else {
    const { data: tracks } = await sb
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalEntityId)
      .limit(2000);
    if (tracks?.length) {
      const ids = tracks.map((t) => t.id);
      /**
       * `album_stats` miss: summing per-track log counts via chunked RPCs can take minutes on
       * huge albums and blocks `/album/[id]`. Cap work for the live path; cron refresh_entity_stats
       * still fills `album_stats` for accurate totals.
       */
      const MAX_TRACKS_FOR_LIVE_ALBUM_LISTEN = 600;
      if (ids.length > MAX_TRACKS_FOR_LIVE_ALBUM_LISTEN) {
        console.warn(
          "[queries] getEntityStatsLive album: capping listen aggregation",
          {
            albumId: canonicalEntityId,
            trackCount: ids.length,
            cap: MAX_TRACKS_FOR_LIVE_ALBUM_LISTEN,
          },
        );
      }
      const capped = ids.slice(0, MAX_TRACKS_FOR_LIVE_ALBUM_LISTEN);
      const playMap = await countLogsByTrackIds(sb, capped);
      listen_count = Array.from(playMap.values()).reduce((a, b) => a + b, 0);
    }
  }

  const { data: reviewRows } = await sb
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

  if (albumLiveT0 != null) {
    albumPagePhaseEnd("getEntityStatsLive(album)", canonicalEntityId, albumLiveT0, {
      listen_count,
      review_count,
    });
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<EntityStats> {
  const mem = getEntityStatsFromMemory(entityType, entityId);
  if (mem) return mem;

  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const canonicalId =
      entityType === "album"
        ? await resolveCanonicalAlbumUuidFromEntityId(sb, entityId)
        : await resolveCanonicalTrackUuidFromEntityId(sb, entityId);
    if (!canonicalId) {
      // Skip memory cache: canonical may appear after catalog upsert.
      const empty: EntityStats = {
        ...DEFAULT_ENTITY_STATS,
        rating_distribution: defaultRatingDistribution(),
      };
      return empty;
    }

    let result: EntityStats | null = null;

    if (entityType === "album") {
      const { data: row, error } = await sb
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
      const { data: row, error } = await sb
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

    if (!result) result = await getEntityStatsLive(entityType, canonicalId, sb);
    setEntityStatsMemory(entityType, entityId, result);
    return result;
  } catch (e) {
    console.error("[queries] getEntityStats failed:", e);
    return {
      ...DEFAULT_ENTITY_STATS,
      rating_distribution: defaultRatingDistribution(),
    };
  }
}

/** Single batch for {@link getTrackStatsForTrackIds} (Supabase `.in()` size limits). */
async function getTrackStatsForTrackIdsSingleBatch(
  uniqueIds: string[],
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = {
    listen_count: 0,
    average_rating: null,
    review_count: 0,
  };
  if (uniqueIds.length === 0) return {};

  const sb = supabase ?? (await createSupabaseServerClient());
  const result: Record<string, EntityStats> = {};

  const { data: rows, error } = await sb
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
      sb.from("logs").select("track_id").in("track_id", missingIds),
      sb
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = {
    listen_count: 0,
    average_rating: null,
    review_count: 0,
  };
  if (trackIds.length === 0) return {};

  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const uniqueIds = [...new Set(trackIds)];
    if (uniqueIds.length <= TRACK_STATS_CHUNK) {
      const result = await getTrackStatsForTrackIdsSingleBatch(uniqueIds, sb);
      return Object.fromEntries(trackIds.map((id) => [id, result[id] ?? empty]));
    }
    const merged: Record<string, EntityStats> = {};
    for (let i = 0; i < uniqueIds.length; i += TRACK_STATS_CHUNK) {
      const chunk = uniqueIds.slice(i, i + TRACK_STATS_CHUNK);
      Object.assign(merged, await getTrackStatsForTrackIdsSingleBatch(chunk, sb));
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
  /** 0-based index for global popular / top-rated leaderboards (RPC path). */
  offset?: number;
  /** @internal After RPC failure, run legacy query without retrying RPC. */
  skipLeaderboardRpc?: boolean;
};

type AlbumStatRow = {
  album_id: string;
  listen_count: number;
  avg_rating: number | null;
};

/** Authoritative listens + ratings from cron (`refresh_entity_stats`). */
async function fetchAlbumStatsMapForLeaderboard(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  albumIds: string[],
): Promise<Map<string, { listen_count: number; avg_rating: number | null }>> {
  const map = new Map<
    string,
    { listen_count: number; avg_rating: number | null }
  >();
  if (albumIds.length === 0) return map;
  for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
    const { data: rows, error } = await supabase
      .from("album_stats")
      .select("album_id, listen_count, avg_rating")
      .in("album_id", chunk);
    if (error) {
      console.warn("[queries] fetchAlbumStatsMapForLeaderboard", error.message);
      continue;
    }
    for (const r of rows ?? []) {
      const row = r as AlbumStatRow;
      map.set(row.album_id, {
        listen_count: Number(row.listen_count ?? 0),
        avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      });
    }
  }
  return map;
}

/** Sum track_stats.listen_count per album (matches how album_stats is built). */
async function sumTrackListenCountsByAlbumIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  albumIds: string[],
): Promise<Map<string, number>> {
  const sums = new Map<string, number>();
  if (albumIds.length === 0) return sums;
  for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, album_id")
      .in("album_id", chunk);
    if (!tracks?.length) continue;
    const trackToAlbum = new Map(
      (tracks as { id: string; album_id: string }[]).map((t) => [
        t.id,
        t.album_id,
      ]),
    );
    const trackIds = [...trackToAlbum.keys()];
    for (let j = 0; j < trackIds.length; j += TRACK_STATS_CHUNK) {
      const sl = trackIds.slice(j, j + TRACK_STATS_CHUNK);
      const { data: statRows } = await supabase
        .from("track_stats")
        .select("track_id, listen_count")
        .in("track_id", sl);
      for (const r of statRows ?? []) {
        const tr = r as { track_id: string; listen_count: number | null };
        const aid = trackToAlbum.get(tr.track_id);
        if (!aid) continue;
        sums.set(
          aid,
          (sums.get(aid) ?? 0) + Number(tr.listen_count ?? 0),
        );
      }
    }
  }
  return sums;
}

/**
 * `album_stats` is filled by `refresh_entity_stats()` cron; if that table is empty,
 * most-favorited still works via `entity_stats`. This path starts from `entity_stats`
 * for candidate albums, then merges `album_stats` + track listen sums so plays/ratings
 * match the primary leaderboard (entity_stats alone often has play_count 0 for albums).
 */
async function getAlbumLeaderboardFromEntityStatsFallback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  type: "popular" | "topRated",
  albumIdsFilter: string[] | null,
  limit: number,
): Promise<LeaderboardEntry[]> {
  /** Popular needs many candidates: merged plays often correct zeros from entity_stats alone. */
  const entityStatsCap = Math.max(
    type === "popular" ? Math.min(5000, limit * 80) : limit * 4,
    200,
  );
  let statsQuery = supabase
    .from("entity_stats")
    .select("entity_id, play_count, avg_rating, favorite_count")
    .eq("entity_type", "album")
    .limit(entityStatsCap);

  if (albumIdsFilter && albumIdsFilter.length > 0) {
    statsQuery = statsQuery.in("entity_id", albumIdsFilter);
  }

  if (type === "popular") {
    statsQuery = statsQuery
      .order("play_count", { ascending: false })
      .order("favorite_count", { ascending: false });
  } else {
    statsQuery = statsQuery
      .order("avg_rating", { ascending: false, nullsFirst: false })
      .order("play_count", { ascending: false });
  }

  const { data: statsRows, error: statsError } = await statsQuery;
  if (statsError || !statsRows?.length) return [];

  const albumIdsFromStats = statsRows.map((r) => r.entity_id as string);
  const [albumStatsMap, trackListenByAlbum] = await Promise.all([
    fetchAlbumStatsMapForLeaderboard(supabase, albumIdsFromStats),
    sumTrackListenCountsByAlbumIds(supabase, albumIdsFromStats),
  ]);

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
  const artistMap = new Map((artistRows ?? []).map((a) => [a.id, a.name]));

  const albumEntries: LeaderboardEntry[] = statsRows
    .map((row): LeaderboardEntry | null => {
      const aid = row.entity_id as string;
      const album = albumMap.get(aid);
      if (!album) return null;
      const fromAlbum = albumStatsMap.get(aid);
      const entityPlays = Number(row.play_count ?? 0);
      const trackSum = trackListenByAlbum.get(aid) ?? 0;
      const total_plays = Math.max(
        fromAlbum?.listen_count ?? 0,
        entityPlays,
        trackSum,
      );
      const average_rating =
        fromAlbum?.avg_rating ??
        (row.avg_rating != null ? Number(row.avg_rating) : null);
      const weighted_score =
        type === "topRated" && average_rating != null
          ? average_rating * Math.log10(1 + total_plays)
          : undefined;
      return {
        entity_type: "album",
        id: album.id,
        name: album.name,
        artist: artistMap.get(album.artist_id) ?? "Unknown",
        artwork_url: album.image_url ?? null,
        total_plays,
        average_rating,
        ...(weighted_score !== undefined && { weighted_score }),
      };
    })
    .filter((x): x is LeaderboardEntry => x != null);

  if (type === "popular") {
    albumEntries.sort((a, b) => b.total_plays - a.total_plays);
    // Merged plays can still be 0 (e.g. favorites-only rows); exclude from "popular".
    const withPlays = albumEntries.filter((a) => a.total_plays > 0);
    return withPlays.slice(0, limit);
  }

  albumEntries.sort(
    (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
  );

  return albumEntries.slice(0, limit);
}

/** Global popular / top-rated: one indexed SQL (see migration 124). Returns null if RPC missing. */
async function getLeaderboardFromRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  type: "popular" | "topRated",
  entity: "song" | "album",
  limit: number,
  offset: number,
): Promise<{ entries: LeaderboardEntry[]; totalCount: number } | null> {
  const p_metric = type === "popular" ? "popular" : "top_rated";
  const rpcName =
    entity === "album" ? "get_leaderboard_albums" : "get_leaderboard_tracks";
  const { data, error } = await supabase.rpc(rpcName, {
    p_metric,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[queries] getLeaderboardFromRpc", rpcName, error.message);
    return null;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return { entries: [], totalCount: 0 };
  }
  const totalCount = Number(rows[0].total_count ?? 0);
  if (entity === "album") {
    const entries: LeaderboardEntry[] = rows.map((row) => {
      const listen = Number(row.listen_count ?? 0);
      const average_rating =
        row.avg_rating != null ? Number(row.avg_rating) : null;
      const weighted_score =
        type === "topRated" && average_rating != null
          ? average_rating * Math.log10(1 + listen)
          : undefined;
      return {
        entity_type: "album",
        id: String(row.album_id),
        name: String(row.album_name ?? ""),
        artist: String(row.artist_name ?? "Unknown"),
        artwork_url: (row.image_url as string | null) ?? null,
        total_plays: listen,
        average_rating,
        ...(weighted_score !== undefined && { weighted_score }),
      };
    });
    return { entries, totalCount };
  }
  const entries: LeaderboardEntry[] = rows.map((row) => {
    const listen = Number(row.listen_count ?? 0);
    const average_rating =
      row.avg_rating != null ? Number(row.avg_rating) : null;
    const weighted_score =
      type === "topRated" && average_rating != null
        ? average_rating * Math.log10(1 + listen)
        : undefined;
    return {
      entity_type: "song",
      id: String(row.track_id),
      name: String(row.track_name ?? ""),
      artist: String(row.artist_name ?? "Unknown"),
      artwork_url: (row.image_url as string | null) ?? null,
      total_plays: listen,
      average_rating,
      ...(weighted_score !== undefined && { weighted_score }),
    };
  });
  return { entries, totalCount };
}

/**
 * Paginated global leaderboard with true total when using DB RPC (migration 124).
 * Year / decade filters fall back to legacy (totalCount null).
 */
export async function getLeaderboardWithTotal(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
  limit: number,
  offset: number,
): Promise<{ entries: LeaderboardEntry[]; totalCount: number | null }> {
  const supabase = await createSupabaseServerClient();
  const off = Math.max(0, offset);
  if (
    (type === "popular" || type === "topRated") &&
    filters.startYear == null &&
    filters.endYear == null &&
    filters.year == null &&
    filters.decade == null
  ) {
    const rpc = await getLeaderboardFromRpc(
      supabase,
      type,
      entity,
      limit,
      off,
    );
    if (rpc !== null) {
      return { entries: rpc.entries, totalCount: rpc.totalCount };
    }
  }
  const need = Math.min(off + limit, 1000);
  const all = await getLeaderboard(
    type,
    { ...filters, skipLeaderboardRpc: true },
    entity,
    need,
  );
  return {
    entries: all.slice(off, off + limit),
    totalCount: null,
  };
}

export async function getLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album" = "song",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { year, decade, startYear, endYear, skipLeaderboardRpc } = filters;

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

      const albumIdsFromStats = statsRows.map((r) => r.entity_id as string);
      const [albumStatsMap, trackListenByAlbum] = await Promise.all([
        fetchAlbumStatsMapForLeaderboard(supabase, albumIdsFromStats),
        sumTrackListenCountsByAlbumIds(supabase, albumIdsFromStats),
      ]);

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
          const aid = row.entity_id as string;
          const album = albumMap.get(aid);
          if (!album) return null;
          const fromAlbum = albumStatsMap.get(aid);
          const entityPlays = Number(row.play_count ?? 0);
          const trackSum = trackListenByAlbum.get(aid) ?? 0;
          const total_plays = Math.max(
            fromAlbum?.listen_count ?? 0,
            entityPlays,
            trackSum,
          );
          const average_rating =
            fromAlbum?.avg_rating ??
            (row.avg_rating != null ? Number(row.avg_rating) : null);
          const artistName = artistMap.get(album.artist_id) ?? "Unknown";
          return {
            entity_type: "album",
            id: aid,
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
    if (
      !skipLeaderboardRpc &&
      (type === "popular" || type === "topRated") &&
      albumIds === null
    ) {
      const off = Math.max(0, filters.offset ?? 0);
      const rpc = await getLeaderboardFromRpc(
        supabase,
        type,
        entity,
        limit,
        off,
      );
      if (rpc !== null) return rpc.entries;
    }

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
        statsRows =
          type === "popular"
            ? merged.filter((r) => Number(r.listen_count ?? 0) > 0)
            : merged;
        if (statsRows.length === 0) return [];
      } else {
        /** Unfiltered charts: cap fetch; require plays > 0 for popular (ties on 0 are unordered in DB). */
        const statsCap = Math.min(
          2000,
          Math.max(limit * 20, type === "popular" ? 200 : 40),
        );
        let statsQuery = supabase
          .from("track_stats")
          .select("track_id, listen_count, avg_rating")
          .order("listen_count", { ascending: false })
          .limit(statsCap);
        if (type === "popular") {
          statsQuery = statsQuery.gt("listen_count", 0);
        }
        const { data: rows, error: statsError } = await statsQuery;
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
        return entries.filter((a) => a.total_plays > 0).slice(0, limit);
      }

      entries.sort(
        (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
      );

      return entries.slice(0, limit);
    }

    // entity === "album"
    // Prefer album_stats (cron aggregates from logs); fall back to entity_stats if empty.
    /** Popular: exclude listen_count = 0 (ties sort arbitrarily; review-only rows pollute top N). */
    const albumStatsLimit = type === "popular" ? 2000 : 500;
    let albumStatsRows: AlbumStatRow[] | null = null;

    if (albumIds && albumIds.length > 0) {
      const mergedAlbumStats: AlbumStatRow[] = [];
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
          return getAlbumLeaderboardFromEntityStatsFallback(
            supabase,
            type,
            albumIds,
            limit,
          );
        }
        if (rows?.length)
          mergedAlbumStats.push(...(rows as AlbumStatRow[]));
      }
      const filtered =
        type === "popular"
          ? mergedAlbumStats.filter(
              (r) => Number(r.listen_count ?? 0) > 0,
            )
          : mergedAlbumStats;
      if (filtered.length === 0) {
        return getAlbumLeaderboardFromEntityStatsFallback(
          supabase,
          type,
          albumIds,
          limit,
        );
      }
      albumStatsRows = filtered;
    } else {
      let albumStatsQuery = supabase
        .from("album_stats")
        .select("album_id, listen_count, avg_rating")
        .order("listen_count", { ascending: false })
        .limit(albumStatsLimit);
      if (type === "popular") {
        albumStatsQuery = albumStatsQuery.gt("listen_count", 0);
      }
      const { data: rows, error: statsError } = await albumStatsQuery;
      if (statsError || !rows?.length) {
        return getAlbumLeaderboardFromEntityStatsFallback(
          supabase,
          type,
          null,
          limit,
        );
      }
      albumStatsRows = rows as AlbumStatRow[];
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

    if (albumEntries.length === 0) {
      return getAlbumLeaderboardFromEntityStatsFallback(
        supabase,
        type,
        albumIds,
        limit,
      );
    }

    if (type === "popular") {
      albumEntries.sort((a, b) => b.total_plays - a.total_plays);
      return albumEntries
        .filter((a) => a.total_plays > 0)
        .slice(0, limit);
    }

    albumEntries.sort(
      (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
    );

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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ReviewWithUser[]> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(sb, artistId);
    if (!canonicalArtistId) return [];

    const [{ data: albumRows }, { data: songRows }] = await Promise.all([
      sb
        .from("albums")
        .select("id")
        .eq("artist_id", canonicalArtistId)
        .limit(1000),
      sb
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

    const { data: rows, error } = await sb
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
      sb,
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ArtistPopularTrack[]> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(sb, artistId);
    if (!canonicalArtistId) return [];

    const { data: songRowsRaw } = await sb
      .from("tracks")
      .select("id, name, album_id, duration_ms")
      .eq("artist_id", canonicalArtistId)
      .limit(1000);
    if (!songRowsRaw?.length) return [];

    const songRows = songRowsRaw.map((s: any) => ({
      ...s,
      artist_id: canonicalArtistId,
    })) as {
      id: string;
      name: string;
      album_id: string;
      duration_ms: number | null;
      artist_id: string;
    }[];

    const trackIds = songRows.map((s) => s.id);
    const statsMap = await getTrackStatsForTrackIds(trackIds, sb);

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
      sb.from("albums").select("id, name, image_url").in("id", albumIds),
      sb
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ListenLogWithUser[]> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(sb, artistId);
    if (!canonicalArtistId) return [];

    const { data: songRows } = await sb
      .from("tracks")
      .select("id")
      .eq("artist_id", canonicalArtistId)
      .limit(1000);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const from = offset;
    const to = offset + limit - 1;

    const { data: logs, error } = await sb
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .range(from, to);

    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const userMap = await fetchUserMap(sb, userIds);

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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<ListenLogWithUser[]> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalAlbumId =
      await resolveCanonicalAlbumUuidFromEntityId(sb, albumId);
    if (!canonicalAlbumId) return [];

    const { data: songRows } = await sb
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalAlbumId)
      .limit(1000);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const from = offset;
    const to = offset + limit - 1;

    const { data: logs, error } = await sb
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .range(from, to);

    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const userMap = await fetchUserMap(sb, userIds);

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
const ALBUMS_DB_PAGE = 1000;
/** Overview ranks "popular" among recent releases only — avoids loading thousands of albums per request. */
const POPULAR_ALBUMS_PREFETCH_MAX = 200;
const ARTIST_ALBUMS_SYNC_TAG = "[artist-albums-sync]";

/** Verbose logs: `ARTIST_ALBUMS_SYNC_DEBUG=1` or `TRACKLIST_DEBUG_ARTIST_PAGE*` / IDs (see artist-page-load-log). */
function artistAlbumsVerbose(artistEntityId: string): boolean {
  if (process.env.ARTIST_ALBUMS_SYNC_DEBUG === "1") return true;
  return isArtistPageDebugEnabled(artistEntityId);
}

/** Non-blocking: full discography sync runs in BullMQ / in-memory queue only (never await on RSC). */
function scheduleArtistDiscographyBackfill(canonicalArtistId: string): void {
  void enqueueSpotifyEnrich({
    name: "sync_artist_discography",
    artistId: canonicalArtistId,
  });
}

async function fetchAllCanonicalAlbumRowsForArtist(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  canonicalArtistId: string,
  /** When set, stop after this many rows (same order as full fetch: newest release first). */
  maxRows?: number,
): Promise<{ id: string; name: string; image_url: string | null }[]> {
  const out: { id: string; name: string; image_url: string | null }[] = [];
  for (let from = 0; ; from += ALBUMS_DB_PAGE) {
    const { data, error } = await supabase
      .from("albums")
      .select("id, name, image_url")
      .eq("artist_id", canonicalArtistId)
      .order("release_date", { ascending: false, nullsFirst: false })
      .range(from, from + ALBUMS_DB_PAGE - 1);
    if (error) {
      console.error("[queries] fetchAllCanonicalAlbumRowsForArtist", error);
      break;
    }
    const rows =
      (data as { id: string; name: string; image_url: string | null }[]) ?? [];
    if (maxRows != null) {
      const need = maxRows - out.length;
      if (need <= 0) break;
      out.push(...rows.slice(0, need));
      if (out.length >= maxRows || rows.length < ALBUMS_DB_PAGE) break;
      continue;
    }
    out.push(...rows);
    if (rows.length < ALBUMS_DB_PAGE) break;
  }
  return out;
}

async function enrichCanonicalAlbumRowsForArtist(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  albums: { id: string; name: string; image_url: string | null }[],
  canonicalArtistId: string,
): Promise<ArtistAlbumEngagementRow[]> {
  if (!albums.length) return [];

  const albumIds = albums.map((a) => a.id);

  const albumToTracks = new Map<string, string[]>();
  for (let i = 0; i < albumIds.length; i += ALBUM_ID_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + ALBUM_ID_IN_CHUNK);
    const { data: songRows } = await supabase
      .from("tracks")
      .select("id, album_id")
      .eq("artist_id", canonicalArtistId)
      .in("album_id", chunk);
    for (const s of songRows ?? []) {
      const list = albumToTracks.get(s.album_id) ?? [];
      list.push(s.id);
      albumToTracks.set(s.album_id, list);
    }
  }

  const allTrackIds = [...new Set([...albumToTracks.values()].flat())];
  const playByTrack = await countLogsByTrackIds(supabase, allTrackIds);

  const reviewAgg = new Map<string, { count: number; sum: number }>();
  for (let i = 0; i < albumIds.length; i += REVIEW_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + REVIEW_IN_CHUNK);
    const { data: revRows } = await supabase
      .from("reviews")
      .select("entity_id, rating")
      .eq("entity_type", "album")
      .in("entity_id", chunk);
    for (const r of revRows ?? []) {
      const cur = reviewAgg.get(r.entity_id) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += r.rating;
      reviewAgg.set(r.entity_id, cur);
    }
  }

  const orderIndex = new Map(albums.map((a, i) => [a.id, i]));

  const rows: ArtistAlbumEngagementRow[] = albums.map((a) => {
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
      image_url: a.image_url,
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

/**
 * Full album list for /artist/[id]/albums: engagement-ranked rows from Supabase.
 * Discography sync is scheduled in the background queue (no Spotify on this request).
 */
export async function getArtistAlbumsWithEngagement(
  artistId: string,
): Promise<ArtistAlbumEngagementRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    scheduleArtistDiscographyBackfill(canonicalArtistId);

    const albums = await fetchAllCanonicalAlbumRowsForArtist(
      supabase,
      canonicalArtistId,
    );
    if (albums.length === 0) {
      void enqueueSpotifyEnrich({
        name: "enrich_artist",
        artistId: canonicalArtistId,
      });
      return [];
    }
    return enrichCanonicalAlbumRowsForArtist(
      supabase,
      albums,
      canonicalArtistId,
    );
  } catch (e) {
    console.error("[queries] getArtistAlbumsWithEngagement failed:", e);
    return [];
  }
}

export type PopularAlbumsForArtistResult = {
  rows: ArtistAlbumEngagementRow[];
  /** True when the catalog has more albums than the overview `limit`. */
  hasMoreAlbums: boolean;
};

/**
 * Albums for the artist overview (default cap 8). DB-only; discography backfill is queued
 * (`sync_artist_discography`) — never block RSC on Spotify.
 */
export async function getPopularAlbumsForArtist(
  artistId: string,
  limit = 8,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<PopularAlbumsForArtistResult> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(sb, artistId);
    if (!canonicalArtistId) {
      if (artistAlbumsVerbose(artistId)) {
        console.log(ARTIST_ALBUMS_SYNC_TAG, "no canonical artist uuid", { artistId });
      }
      return { rows: [], hasMoreAlbums: false };
    }

    scheduleArtistDiscographyBackfill(canonicalArtistId);

    if (artistAlbumsVerbose(artistId)) {
      console.log(ARTIST_ALBUMS_SYNC_TAG, "scheduled sync_artist_discography (non-blocking)", {
        artistId,
        canonicalArtistId,
      });
    }

    const { count: totalAlbumCount } = await sb
      .from("albums")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", canonicalArtistId);

    const albums = await fetchAllCanonicalAlbumRowsForArtist(
      sb,
      canonicalArtistId,
      POPULAR_ALBUMS_PREFETCH_MAX,
    );

    if (albums.length === 0) {
      void enqueueSpotifyEnrich({
        name: "enrich_artist",
        artistId: canonicalArtistId,
      });
      return { rows: [], hasMoreAlbums: false };
    }

    const enriched = await enrichCanonicalAlbumRowsForArtist(
      sb,
      albums,
      canonicalArtistId,
    );
    const rows = enriched.slice(0, limit);
    const total = totalAlbumCount ?? albums.length;
    const hasMoreAlbums = total > limit;

    if (artistAlbumsVerbose(artistId)) {
      console.log(ARTIST_ALBUMS_SYNC_TAG, "getPopularAlbumsForArtist result", {
        artistId,
        canonicalArtistId,
        overviewLimit: limit,
        dbAlbumCountAfter: total,
        albumRowsFetched: albums.length,
        enrichedCount: enriched.length,
        rowsReturned: rows.length,
        hasMoreAlbums,
        topRowNames: rows.map((r) => r.name),
      });
    }

    return { rows, hasMoreAlbums };
  } catch (e) {
    console.error("[queries] getPopularAlbumsForArtist failed:", e);
    return { rows: [], hasMoreAlbums: false };
  }
}

/** Album engagement: listen count, review count, average rating, profile favorite count. */
export async function getAlbumEngagementStats(
  albumId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
  favorite_count: number;
}> {
  const sb = supabase ?? (await createSupabaseServerClient());
  const stats = await getEntityStats("album", albumId, sb);
  let favorite_count = 0;
  try {
    const canonicalId = await resolveCanonicalAlbumUuidFromEntityId(
      sb,
      albumId,
    );
    if (canonicalId) {
      const { data: row } = await sb
        .from("entity_stats")
        .select("favorite_count")
        .eq("entity_type", "album")
        .eq("entity_id", canonicalId)
        .maybeSingle();
      favorite_count = Number(row?.favorite_count ?? 0);
    }
  } catch (e) {
    console.warn("[queries] getAlbumEngagementStats favorite_count:", e);
  }
  return {
    listen_count: stats.listen_count,
    review_count: stats.review_count,
    avg_rating: stats.average_rating,
    favorite_count,
  };
}

export type AlbumFavoritedByUserRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_following: boolean;
};

/**
 * Users who have this album as a profile favorite, ordered by username.
 * Requires migration `125_album_favorited_by_users_rpc.sql`.
 */
export async function getAlbumFavoritedByUsers(
  albumEntityId: string,
  viewerId: string | null,
  options: { limit?: number; offset?: number } = {},
): Promise<{ users: AlbumFavoritedByUserRow[]; total: number }> {
  const { limit = 20, offset = 0 } = options;
  const supabase = await createSupabaseServerClient();
  const canonicalId = await resolveCanonicalAlbumUuidFromEntityId(
    supabase,
    albumEntityId,
  );
  if (!canonicalId) {
    return { users: [], total: 0 };
  }

  const cap = Math.min(Math.max(1, limit), 50);
  const off = Math.max(0, offset);

  const { data, error } = await supabase.rpc("get_album_favorited_by_users", {
    p_album_id: canonicalId,
    p_limit: cap,
    p_offset: off,
  });

  if (error) {
    console.error("[queries] getAlbumFavoritedByUsers RPC:", error.message);
    return { users: [], total: 0 };
  }

  const rows = (data ?? []) as {
    id: string;
    username: string;
    avatar_url: string | null;
    total_count: number | string;
  }[];

  if (rows.length === 0) {
    return { users: [], total: 0 };
  }

  const total = Number(rows[0].total_count ?? 0);
  const base = rows.map((r) => ({
    id: r.id,
    username: r.username,
    avatar_url: r.avatar_url ?? null,
  }));

  const enriched = await enrichUsersWithFollowStatus(base, viewerId);
  const users: AlbumFavoritedByUserRow[] = enriched.map((u) => ({
    id: u.id,
    username: u.username,
    avatar_url: u.avatar_url,
    is_following: u.is_following,
  }));

  return { users, total };
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<FriendAlbumActivityRow[]> {
  const t0 = albumPagePhaseStart("getFriendsAlbumActivity", albumId);
  try {
    const sb = supabase ?? (await createSupabaseServerClient());

    const canonicalAlbumId =
      await resolveCanonicalAlbumUuidFromEntityId(sb, albumId);
    if (!canonicalAlbumId) {
      albumPagePhaseEnd("getFriendsAlbumActivity", albumId, t0, {
        reason: "no_canonical_album",
      });
      return [];
    }

    const { data: songRows } = await sb
      .from("tracks")
      .select("id")
      .eq("album_id", canonicalAlbumId)
      .limit(1000);
    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) {
      albumPagePhaseEnd("getFriendsAlbumActivity", albumId, t0, { reason: "no_tracks" });
      return [];
    }

    const { data: followRows } = await sb
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .limit(500);
    const followingIds = (followRows ?? []).map((f) => f.following_id);
    if (followingIds.length === 0) {
      albumPagePhaseEnd("getFriendsAlbumActivity", albumId, t0, {
        reason: "no_follows",
      });
      return [];
    }

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: logs, error } = await sb
      .from("logs")
      .select("user_id, listened_at")
      .in("track_id", trackIds)
      .in("user_id", followingIds)
      .gte("listened_at", thirtyDaysAgo)
      .order("listened_at", { ascending: false })
      .limit(100);

    if (error || !logs?.length) {
      albumPagePhaseEnd("getFriendsAlbumActivity", albumId, t0, {
        reason: "no_logs",
      });
      return [];
    }

    const seen = new Set<string>();
    const onePerUser = logs.filter((l) => {
      if (seen.has(l.user_id)) return false;
      seen.add(l.user_id);
      return true;
    });
    const limited = onePerUser.slice(0, limit);

    const userIds = limited.map((l) => l.user_id);
    const [usersRes, reviewsRes] = await Promise.all([
      sb
        .from("users")
        .select("id, username, avatar_url")
        .in("id", userIds),
      sb
        .from("reviews")
        .select("user_id, rating")
        .eq("entity_type", "album")
        .eq("entity_id", canonicalAlbumId)
        .in("user_id", userIds),
    ]);
    const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
    const ratingMap = new Map(
      (reviewsRes.data ?? []).map((r) => [r.user_id, r.rating]),
    );

    const rows = limited
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
    albumPagePhaseEnd("getFriendsAlbumActivity", albumId, t0, {
      resultRows: rows.length,
    });
    return rows;
  } catch (e) {
    console.error("[queries] getFriendsAlbumActivity failed:", e);
    albumPagePhaseError("getFriendsAlbumActivity", albumId, t0, e);
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
      .eq("album_id", albumId)
      .limit(1000);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const logsPromise = supabase
      .from("logs")
      .select("user_id, listened_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .limit(200);

    const followsPromise = supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .limit(500);

    const [logsRes, followsRes] = await Promise.all([
      logsPromise,
      followsPromise,
    ]);

    const { data: logs, error } = logsRes;
    if (error || !logs?.length) return [];

    const { data: followRows } = followsRes;
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
    const { data: privRows } = await supabase
      .from("users")
      .select("id, logs_private")
      .in("id", userIds);
    const privateIds = new Set(
      (privRows ?? [])
        .filter((u) => (u as { logs_private?: boolean }).logs_private)
        .map((u) => (u as { id: string }).id),
    );
    const uniqueFiltered = unique.filter((u) => !privateIds.has(u.user_id));
    if (uniqueFiltered.length === 0) return [];

    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", uniqueFiltered.map((u) => u.user_id));
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return uniqueFiltered
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<UserStreak | null> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const { data, error } = await sb
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
  /** When set, avoids a second `createSupabaseServerClient()` (parallel clients + `cookies()` can deadlock RSC). */
  existingClient?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<number> {
  try {
    const supabase = existingClient ?? (await createSupabaseServerClient());
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
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<boolean> {
  if (viewerUserId === targetUserId) return false;
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const { data, error } = await sb
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
export async function getFollowCounts(
  userId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{
  followers_count: number;
  following_count: number;
}> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    const { data, error } = await sb.rpc("get_follow_counts", {
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
      sb
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", userId),
      sb
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

/** Detailed profile for a user by username, enriched with viewer context. */
export async function getFullUserProfile(
  username: string,
  viewerId: string | null = null,
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRow, error } = await supabase
      .from("users")
      .select(
        "id, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at",
      )
      .eq("username", username)
      .single();

    if (error || !userRow) return null;
    const user = { ...userRow, username };

    const followCountsPromise = getFollowCounts(user.id);

    const followingStatusPromise = (async () => {
      if (viewerId && viewerId !== user.id) {
        const { data: follow, error: followError } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", viewerId)
          .eq("following_id", user.id)
          .maybeSingle();
        return !followError && !!follow;
      }
      return false;
    })();

    const [followCounts, followingStatus] = await Promise.all([
      followCountsPromise,
      followingStatusPromise,
    ]);

    const { followers_count: followers, following_count: following } = followCounts;

    const isOwn = viewerId === user.id;

    return {
      ...user,
      lastfm_username: isOwn ? user.lastfm_username ?? null : null,
      lastfm_last_synced_at: isOwn ? user.lastfm_last_synced_at ?? null : null,
      followers_count: followers ?? 0,
      following_count: following ?? 0,
      is_following: followingStatus,
      is_own_profile: isOwn,
    };
  } catch (e) {
    console.error("[queries] getFullUserProfile failed:", e);
    return null;
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
  const supabase = await createSupabaseServerClient();
  return listUsersByCreatedAtWithClient(
    supabase,
    limit,
    offset,
    excludeUserId,
  );
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

export type { FeedListenSessionRow };

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

    const bundled = await tryHomeFeedLegacyBundle(
      supabase,
      userId,
      fetchLimit,
      cursorTs,
      "[queries]",
    );
    if (bundled) {
      return buildActivityFeedFromLegacyRows(
        fetchUserMap,
        supabase,
        cappedLimit,
        bundled.reviewRows,
        bundled.followRows,
        bundled.listenSessions,
      );
    }

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

    const reviewRows = (reviewsRes.data ?? []) as FeedReviewRpcRow[];
    const followRows = (followsRes.data ?? []) as FeedFollowRpcRow[];

    return buildActivityFeedFromLegacyRows(
      fetchUserMap,
      supabase,
      cappedLimit,
      reviewRows,
      followRows,
      listenSessions,
    );
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
          "id, entity_type, entity_id, rating, review_text, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("follows")
        .select("id, following_id, created_at")
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

    const reviewActivities: FeedActivity[] = (
      reviewRows as unknown as {
        id: string;
        entity_type: string;
        entity_id: string;
        rating: number;
        review_text: string | null;
        created_at: string;
        updated_at: string;
      }[]
    ).map((r) => ({
      type: "review",
      created_at: r.created_at,
      review: {
        id: r.id,
        user_id: userId,
        entity_type: r.entity_type as "album" | "song",
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: userMap.get(userId) ?? null,
      },
    }));

    const followActivities: FeedActivity[] = (
      followRows as unknown as {
        id: string;
        following_id: string;
        created_at: string;
      }[]
    ).map((f) => ({
      type: "follow",
      id: f.id,
      created_at: f.created_at,
      follower_id: userId,
      following_id: f.following_id,
      follower_username: userMap.get(userId)?.username ?? null,
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

    const { data: rawListRow, error: listError } = await supabase
      .from("lists")
      .select(
        "user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .eq("id", listId)
      .maybeSingle();

    if (listError || !rawListRow) return null;
    const listRow = { ...rawListRow, id: listId };

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
