import "server-only";

import { getEntityDisplayNames } from "@/lib/queries";
import type { ActivityFeedPage } from "@/lib/queries";
import { getMergedActivityFeed } from "@/lib/feed/merged-feed";
import { logPerf, timeAsync } from "@/lib/profiling";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstGetValue,
} from "@/lib/cache/stale-first-cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FeedActivity } from "@/types";

/** Same logical key as `GET /api/feed` for Redis + in-memory stale-first. */
export function feedStaleFirstCacheKey(
  userId: string,
  limit: number,
  cursor: string | null,
): string {
  return `feed:${userId}:${limit}:${cursor ?? "null"}`;
}

/**
 * Payload shape stored in stale-first (Redis + memory) for `/api/feed` and home RSC.
 * Matches the JSON body of `GET /api/feed` except `fetched_at` is added by the cache layer.
 */
export type FeedEnrichedCachePayload = {
  items: FeedActivity[];
  nextCursor: string | null;
  events: FeedActivity[];
};

export async function fetchFeedEnrichedPayload(
  userId: string,
  limit: number,
  cursor: string | null,
): Promise<FeedEnrichedCachePayload> {
  const { items, next_cursor } = await getMergedActivityFeed(
    userId,
    limit,
    cursor,
  );

  const [withNames, withAlbums] = await Promise.all([
    enrichFeedActivitiesWithEntityNames(items),
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

  const events = enrichedList.filter((a) => a.type === "feed_story");
  return {
    items: enrichedList,
    nextCursor: next_cursor,
    events,
  };
}

export async function getFeedForUser(
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  return timeAsync("db", "getFeedForUser", async () => {
    const p = await fetchFeedEnrichedPayload(userId, limit, cursor);
    return { items: p.items, next_cursor: p.nextCursor };
  }, { limit, hasCursor: !!cursor });
}

/**
 * Home page initial feed (RSC). Uses the same Redis stale-first key as `GET /api/feed`
 * (`feed:${userId}:${limit}:${cursor}`) so the first HTML payload shares cache with
 * pagination. Next.js `unstable_cache` is not used here (request-scoped cookies + user
 * isolation are handled via this key + server-only fetchers). Security: only code paths
 * that already know `userId` from the session call this; RLS-backed `getActivityFeed`
 * inside `fetchFeedEnrichedPayload` is unchanged.
 */
export async function getHomeFeedInitialForUser(
  userId: string,
  limit = 50,
): Promise<ActivityFeedPage> {
  return timeAsync("db", "getFeedForUser", async () => {
    const cacheKey = feedStaleFirstCacheKey(userId, limit, null);
    const t0 = performance.now();
    const stale = await staleFirstGetValue(
      cacheKey,
      STALE_FIRST_TTL_SEC.feed,
      STALE_FIRST_STALE_AFTER_SEC.feed,
      () => fetchFeedEnrichedPayload(userId, limit, null),
    );
    logPerf("cache", "homeFeedStaleFirst", performance.now() - t0, {
      staleFirst: stale.staleFirst,
    });
    return {
      items: stale.items,
      next_cursor: stale.nextCursor,
    };
  }, { limit, hasCursor: false });
}

/** Enrich review activities with entity names (album/track) for display. Uses DB first, then spotify-cache for missing. */
export async function enrichFeedActivitiesWithEntityNames(
  activities: FeedActivity[],
): Promise<(FeedActivity & { spotifyName?: string })[]> {
  return timeAsync("enrich", "enrichFeedActivitiesWithEntityNames", async () => {
  const reviewItems = activities
    .filter((a): a is FeedActivity & { type: "review" } => a.type === "review")
    .map((a) => ({ entity_type: a.review.entity_type, entity_id: a.review.entity_id }));

  const nameMap = await getEntityDisplayNames(reviewItems);

  const out: (FeedActivity & { spotifyName?: string })[] = [];
  for (const activity of activities) {
    if (activity.type !== "review") {
      out.push({ ...activity, spotifyName: undefined });
      continue;
    }
    const name = nameMap.get(activity.review.entity_id);
    out.push({ ...activity, spotifyName: name ?? undefined });
  }
  return out;
  }, { n: activities.length });
}

/** Enrich listen_session activities with album metadata and track names for display. */
export async function enrichListenSessionsWithAlbums(
  activities: FeedActivity[],
): Promise<FeedActivity[]> {
  return timeAsync("enrich", "enrichListenSessionsWithAlbums", async () => {
  const supabase = createSupabaseAdminClient();
  const sessionActivities = activities.filter(
    (a): a is FeedActivity & { type: "listen_session" } => a.type === "listen_session",
  );
  const summaryActivities = activities.filter(
    (a): a is FeedActivity & { type: "listen_sessions_summary" } => a.type === "listen_sessions_summary",
  );
  const albumIds = new Set<string>(sessionActivities.map((s) => s.album_id));
  const trackIdsNeedingName = new Set<string>();
  const collectTrackIds = (s: { track_id?: string; track_name?: string | null }) => {
    if (s.track_id && !s.track_name) trackIdsNeedingName.add(s.track_id);
  };
  sessionActivities.forEach(collectTrackIds);
  summaryActivities.forEach((s) => s.sessions.forEach(collectTrackIds));
  summaryActivities.forEach((s) => s.sessions.forEach((sess) => albumIds.add(sess.album_id)));

  const albumIdList = [...albumIds];
  const trackIdList = [...trackIdsNeedingName];

  type DbArtist = { id: string; name: string };
  type DbAlbum = { id: string; name: string; artist_id: string; image_url: string | null };
  type DbTrack = { id: string; name: string; artist_id: string | null };

  const [{ data: albumRows }, { data: trackRows }] = await Promise.all([
    albumIdList.length > 0
      ? supabase
          .from("albums")
          .select("id, name, artist_id, image_url")
          .in("id", albumIdList)
          .limit(500)
      : Promise.resolve({ data: [] as DbAlbum[] }),
    trackIdList.length > 0
      ? supabase
          .from("tracks")
          .select("id, name, artist_id")
          .in("id", trackIdList)
          .limit(500)
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

  const applyTrackName = <T extends { track_id?: string; track_name?: string | null; artist_name?: string | null }>(
    s: T,
  ): T => {
    if (s.track_name) return s;
    const track = s.track_id ? trackMap.get(s.track_id) : null;
    if (!track) return s;
    return {
      ...s,
      track_name: track.name ?? null,
      artist_name: track.artists?.map((a: { name: string }) => a.name).join(", ") ?? null,
    } as T;
  };

  return activities.map((activity): FeedActivity => {
    if (activity.type === "feed_story") return activity;
    if (activity.type === "listen_session") {
      const withTrack = applyTrackName(activity);
      const album = albumMap.get(activity.album_id) ?? null;
      return { ...withTrack, album };
    }
    if (activity.type === "listen_sessions_summary") {
      const sessions = activity.sessions.map((sess) => {
        const withTrack = applyTrackName(sess);
        return { ...withTrack, album: albumMap.get(sess.album_id) ?? null };
      });
      return { ...activity, sessions };
    }
    return activity;
  });
  }, { n: activities.length });
}
