/**
 * Activity feed for Express — same behavior as `lib/queries.getActivityFeed` + `lib/feed` enrichment,
 * using the service-role Supabase client (same as authenticated user id in RPC params).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildActivityFeedFromLegacyRows,
  tryHomeFeedLegacyBundle,
  type FeedFollowRpcRow,
  type FeedReviewRpcRow,
} from "../../lib/feed/legacy-feed-bundle";
import { getAlbum, getTrack } from "../lib/spotify";

/** Matches `FeedActivity` from root `types` (JSON shape for web + mobile). */
type FeedActivity = any; // eslint-disable-line @typescript-eslint/no-explicit-any

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
    userIds.add(userId);
    reviewRows.forEach((r: { user_id: string }) => userIds.add(r.user_id));
    followRows.forEach((f: { follower_id: string, following_id: string }) => {
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

    const followActivities: FeedActivity[] = followRows.map((f: { id: string, follower_id: string, following_id: string, created_at: string }) => ({
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

/**
 * Same as `lib/feed.ts` `enrichListenSessionsWithAlbums`: DB `albums`/`tracks`/`artists`
 * (reliable cover URLs from `image_url`). The previous Spotify `getAlbums` path often
 * returned empty art on mobile when the Express API was used instead of Next.js.
 */
async function enrichListenSessionsWithAlbums(
  supabase: SupabaseClient,
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

  type DbArtist = { id: string; name: string };
  type DbAlbum = {
    id: string;
    name: string;
    artist_id: string;
    image_url: string | null;
  };
  type DbTrack = { id: string; name: string; artist_id: string | null };

  const [{ data: albumRows }, { data: trackRows }] = await Promise.all([
    albumIdList.length > 0
      ? supabase
          .from("albums")
          .select("id, name, artist_id, image_url")
          .in("id", albumIdList)
      : Promise.resolve({ data: [] as DbAlbum[] }),
    trackIdList.length > 0
      ? supabase
          .from("tracks")
          .select("id, name, artist_id")
          .in("id", trackIdList)
      : Promise.resolve({ data: [] as DbTrack[] }),
  ]);

  const artistIds = new Set<string>();
  for (const a of (albumRows ?? []) as DbAlbum[]) artistIds.add(a.artist_id);
  for (const t of (trackRows ?? []) as DbTrack[]) {
    if (t.artist_id) artistIds.add(t.artist_id);
  }
  const { data: artistRows } =
    artistIds.size > 0
      ? await supabase
          .from("artists")
          .select("id, name")
          .in("id", [...artistIds])
      : { data: [] as DbArtist[] };

  const artistNameById = new Map(
    ((artistRows ?? []) as DbArtist[]).map((r) => [r.id, r.name]),
  );

  const albumMap = new Map(
    ((albumRows ?? []) as DbAlbum[]).map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        images: a.image_url ? [{ url: a.image_url }] : [],
        artists: [{ id: a.artist_id, name: artistNameById.get(a.artist_id) ?? "" }],
      },
    ]),
  );
  const trackMap = new Map(
    ((trackRows ?? []) as DbTrack[]).map((t) => [
      t.id,
      {
        name: t.name,
        artists: t.artist_id
          ? [{ id: t.artist_id, name: artistNameById.get(t.artist_id) ?? "" }]
          : [],
      },
    ]),
  );

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
    if (activity.type === "feed_story") return activity;
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
          album: albumMap.get((sess as { album_id: string }).album_id) ?? null,
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

    const bundled = await tryHomeFeedLegacyBundle(
      supabase,
      userId,
      fetchLimit,
      cursorTs,
      "[activityFeedService]",
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
    enrichListenSessionsWithAlbums(supabase, items),
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
