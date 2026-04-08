import type { FeedActivity, FeedListenSession } from "@/types";

/** Narrow RPC shape so Next (root) and Express (backend) Supabase clients both match (separate node_modules copies are not assignable as classes). */
type LegacyFeedRpcLike = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Matches `get_feed_reviews` / reviews table rows. */
export type FeedReviewRpcRow = {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedFollowRpcRow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

/** Matches `get_feed_listen_sessions` output (shared with `lib/queries` getFeedListenSessions). */
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

export type ActivityFeedPageLegacy = {
  items: FeedActivity[];
  next_cursor: string | null;
};

function parseBundleReview(r: unknown): FeedReviewRpcRow | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.user_id !== "string") return null;
  return {
    id: o.id,
    user_id: o.user_id,
    entity_type: String(o.entity_type ?? ""),
    entity_id: String(o.entity_id ?? ""),
    rating: Number(o.rating) || 0,
    review_text: o.review_text == null ? null : String(o.review_text),
    created_at: String(o.created_at ?? ""),
    updated_at: String(o.updated_at ?? o.created_at ?? ""),
  };
}

function parseBundleFollow(r: unknown): FeedFollowRpcRow | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.follower_id !== "string") return null;
  return {
    id: o.id,
    follower_id: o.follower_id,
    following_id: String(o.following_id ?? ""),
    created_at: String(o.created_at ?? ""),
  };
}

function parseListenSessionFromBundleJson(r: unknown): FeedListenSessionRow | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.user_id !== "string") return null;
  return {
    type: String(o.type ?? ""),
    user_id: o.user_id,
    track_id: String(o.track_id ?? ""),
    album_id: String(o.album_id ?? ""),
    track_name: o.track_name == null ? null : String(o.track_name),
    artist_name: o.artist_name == null ? null : String(o.artist_name),
    song_count: Number(o.song_count) || 0,
    first_listened_at: String(o.first_listened_at ?? ""),
    created_at: String(o.created_at ?? ""),
  };
}

/**
 * Migration 140 `get_home_feed_legacy_bundle`: one Postgres round-trip for reviews + follows + listens.
 */
export async function tryHomeFeedLegacyBundle<S>(
  supabase: S,
  userId: string,
  fetchLimit: number,
  cursorTs: string | null,
  logPrefix: string,
): Promise<{
  reviewRows: FeedReviewRpcRow[];
  followRows: FeedFollowRpcRow[];
  listenSessions: FeedListenSessionRow[];
} | null> {
  const { data, error } = await (supabase as LegacyFeedRpcLike).rpc(
    "get_home_feed_legacy_bundle",
    {
      p_follower_id: userId,
      p_cursor: cursorTs,
      p_limit: fetchLimit,
    },
  );
  if (error) {
    console.warn(
      `${logPrefix} get_home_feed_legacy_bundle RPC unavailable, using parallel RPCs:`,
      error.message,
    );
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const reviewsRaw = o.reviews;
  const followsRaw = o.follows;
  const listensRaw = o.listen_sessions;
  const reviewRows = Array.isArray(reviewsRaw)
    ? reviewsRaw.map(parseBundleReview).filter((x): x is FeedReviewRpcRow => x != null)
    : [];
  const followRows = Array.isArray(followsRaw)
    ? followsRaw.map(parseBundleFollow).filter((x): x is FeedFollowRpcRow => x != null)
    : [];
  const listenSessions = Array.isArray(listensRaw)
    ? listensRaw
        .map(parseListenSessionFromBundleJson)
        .filter((x): x is FeedListenSessionRow => x != null)
    : [];
  return { reviewRows, followRows, listenSessions };
}

type FeedUserMap = Map<
  string,
  { id: string; username: string; avatar_url: string | null }
>;

/**
 * Merge, priority-sort, and collapse listen runs — shared by Next.js `getActivityFeed` and Express feed.
 */
export async function buildActivityFeedFromLegacyRows<S>(
  fetchUserMapForFeed: (
    supabase: S,
    userIds: string[],
  ) => Promise<FeedUserMap>,
  supabase: S,
  cappedLimit: number,
  reviewRows: FeedReviewRpcRow[],
  followRows: FeedFollowRpcRow[],
  listenSessions: FeedListenSessionRow[],
): Promise<ActivityFeedPageLegacy> {
  const userIds = new Set<string>();
  reviewRows.forEach((r) => userIds.add(r.user_id));
  followRows.forEach((f) => {
    userIds.add(f.follower_id);
    userIds.add(f.following_id);
  });
  listenSessions.forEach((s) => userIds.add(s.user_id));
  const userMap = await fetchUserMapForFeed(supabase, [...userIds]);

  const reviewActivities: FeedActivity[] = reviewRows.map((r) => ({
    type: "review",
    created_at: r.created_at,
    review: {
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text,
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
}
