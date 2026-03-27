/**
 * Activity feed for Express — same behavior as `lib/queries.getActivityFeed` + `lib/feed` enrichment,
 * using the service-role Supabase client (same as authenticated user id in RPC params).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAlbum, getAlbums, getTrack, getTracks } from "../lib/spotify";

/** Matches `FeedActivity` from root `types` (JSON shape for web + mobile). */
type FeedActivity = any;

export type ActivityFeedPage = {
  items: FeedActivity[];
  next_cursor: string | null;
};

async function fetchUserMap(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<
  Map<
    string,
    { id: string; username: string; avatar_url: string | null }
  >
> {
  if (userIds.length === 0) return new Map();
  const { data: users } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .in("id", userIds);
  return new Map(
    (users ?? []).map((u) => [
      u.id as string,
      {
        id: u.id as string,
        username: u.username as string,
        avatar_url: (u.avatar_url as string | null) ?? null,
      },
    ]),
  );
}

async function getFeedListenSessions(
  supabase: SupabaseClient,
  followerId: string,
  limit: number,
  cursor?: string | null,
): Promise<
  {
    type: string;
    user_id: string;
    track_id: string;
    album_id: string;
    track_name: string | null;
    artist_name: string | null;
    song_count: number;
    first_listened_at: string;
    created_at: string;
  }[]
> {
  const capped = Math.min(Math.max(1, limit), 100);
  const { data, error } = await supabase.rpc("get_feed_listen_sessions", {
    p_follower_id: followerId,
    p_cursor: cursor ?? null,
    p_limit: capped,
  });
  if (error) {
    console.warn("[activityFeedService] get_feed_listen_sessions:", error.message);
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
}

async function getActivityFeedFallback(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
  cursor: string | null,
): Promise<ActivityFeedPage> {
  try {
    const { data: followings, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);
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
    reviewRows.forEach((r: { user_id: string }) => userIds.add(r.user_id));
    followRows.forEach((f) => {
      userIds.add(f.follower_id);
      userIds.add(f.following_id);
    });
    const userMap = await fetchUserMap(supabase, [...userIds]);

    const reviewActivities: FeedActivity[] = reviewRows.map(
      (r: {
        id: string;
        user_id: string;
        entity_type: string;
        entity_id: string;
        rating: number;
        review_text: string | null;
        created_at: string;
        updated_at: string;
      }) => ({
        type: "review" as const,
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
      }),
    );

    const followActivities: FeedActivity[] = followRows.map((f) => ({
      type: "follow" as const,
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
    console.error("[activityFeedService] fallback failed:", e);
    return { items: [], next_cursor: null };
  }
}

async function getEntityDisplayNames(
  supabase: SupabaseClient,
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

  if (songIds.length > 0) {
    const { data: songs } = await supabase
      .from("songs")
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

async function enrichFeedActivitiesWithEntityNames(
  supabase: SupabaseClient,
  activities: FeedActivity[],
): Promise<(FeedActivity & { spotifyName?: string })[]> {
  const reviewItems = activities
    .filter((a): a is FeedActivity & { type: "review" } => a.type === "review")
    .map((a) => ({
      entity_type: a.review.entity_type,
      entity_id: a.review.entity_id,
    }));

  const nameMap = await getEntityDisplayNames(supabase, reviewItems);

  const out: (FeedActivity & { spotifyName?: string })[] = [];
  for (const activity of activities) {
    if (activity.type !== "review") {
      out.push({ ...activity, spotifyName: undefined });
      continue;
    }
    let name = nameMap.get(activity.review.entity_id);
    if (name == null) {
      try {
        name =
          activity.review.entity_type === "album"
            ? (await getAlbum(activity.review.entity_id)).name
            : (await getTrack(activity.review.entity_id)).name;
      } catch {
        name = undefined;
      }
    }
    out.push({ ...activity, spotifyName: name ?? undefined });
  }
  return out;
}

async function enrichListenSessionsWithAlbums(
  activities: FeedActivity[],
): Promise<FeedActivity[]> {
  const sessionActivities = activities.filter(
    (a: FeedActivity) => a.type === "listen_session",
  );
  const summaryActivities = activities.filter(
    (a) => a.type === "listen_sessions_summary",
  );
  const albumIds = new Set<string>(sessionActivities.map((s) => s.album_id));
  const trackIdsNeedingName = new Set<string>();
  const collectTrackIds = (s: {
    track_id?: string;
    track_name?: string | null;
  }) => {
    if (s.track_id && !s.track_name) trackIdsNeedingName.add(s.track_id);
  };
  sessionActivities.forEach(collectTrackIds);
  summaryActivities.forEach((s) => s.sessions.forEach(collectTrackIds));
  summaryActivities.forEach((s) =>
    s.sessions.forEach((sess: { album_id: string }) =>
      albumIds.add(sess.album_id),
    ),
  );

  const albumIdList = [...albumIds];
  const trackIdList = [...trackIdsNeedingName];
  const albumArr =
    albumIdList.length > 0 ? await getAlbums(albumIdList) : [];
  const trackArr =
    trackIdList.length > 0 ? await getTracks(trackIdList) : [];

  const albumMap = new Map(albumArr.map((a) => [a.id, a]));
  const trackMap = new Map(trackArr.map((t) => [t.id, t]));

  const applyTrackName = <
    T extends {
      track_id?: string;
      track_name?: string | null;
      artist_name?: string | null;
    },
  >(
    s: T,
  ): T => {
    if (s.track_name) return s;
    const track = s.track_id ? trackMap.get(s.track_id) : null;
    if (!track) return s;
    return {
      ...s,
      track_name: track.name ?? null,
      artist_name:
        track.artists?.map((a: { name: string }) => a.name).join(", ") ?? null,
    } as T;
  };

  return activities.map((activity: FeedActivity): FeedActivity => {
    if (activity.type === "listen_session") {
      const withTrack = applyTrackName(activity);
      const album = albumMap.get(activity.album_id) ?? null;
      return { ...withTrack, album };
    }
    if (activity.type === "listen_sessions_summary") {
      const sessions = activity.sessions.map((sess: FeedActivity) => {
        const withTrack = applyTrackName(sess);
        return {
          ...withTrack,
          album: albumMap.get(sess.album_id) ?? null,
        };
      });
      return { ...activity, sessions };
    }
    return activity;
  });
}

export async function getActivityFeedForExpress(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  try {
    const cappedLimit = Math.min(Math.max(1, limit), 100);
    const fetchLimit = cappedLimit * 2;
    const cursorTs = cursor ? cursor : null;

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
      getFeedListenSessions(supabase, userId, fetchLimit, cursorTs),
    ]);

    if (reviewsRes.error) {
      console.warn("[activityFeedService] get_feed_reviews:", reviewsRes.error);
      return getActivityFeedFallback(supabase, userId, cappedLimit, cursor);
    }
    if (followsRes.error) {
      console.warn("[activityFeedService] get_feed_follows:", followsRes.error);
      return getActivityFeedFallback(supabase, userId, cappedLimit, cursor);
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
        (merged[i + 1] as { user_id: string }).user_id === item.user_id
      ) {
        run.push(merged[i + 1]);
        i++;
      }
      i++;
      if (run.length === 1) {
        collapsed.push(run[0]);
      } else {
        const latest = run.reduce(
          (best, r) => (r.created_at > best.created_at ? r : best),
          run[0],
        );
        collapsed.push({
          type: "listen_sessions_summary",
          user_id: item.user_id,
          song_count: run.length,
          created_at: latest.created_at,
          user: item.user ?? null,
          sessions: run.slice(0, 10),
        });
      }
    }

    const items = collapsed.slice(0, cappedLimit);
    const next_cursor =
      items.length === cappedLimit ? items[items.length - 1].created_at : null;

    return { items, next_cursor };
  } catch (e) {
    console.error("[activityFeedService] getActivityFeedForExpress:", e);
    return getActivityFeedFallback(supabase, userId, Math.min(limit, 100), cursor);
  }
}

export async function enrichFeedResponse(
  supabase: SupabaseClient,
  page: ActivityFeedPage,
): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const { items, next_cursor } = page;
  const [withNames, withAlbums] = await Promise.all([
    enrichFeedActivitiesWithEntityNames(supabase, items),
    enrichListenSessionsWithAlbums(items),
  ]);

  const enrichedList = withAlbums.map((activity, i) =>
    activity.type === "review" && withNames[i]
      ? {
          ...activity,
          spotifyName: (withNames[i] as { spotifyName?: string }).spotifyName,
        }
      : activity,
  );

  return { items: enrichedList, nextCursor: next_cursor };
}
