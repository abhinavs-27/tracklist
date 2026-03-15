import "server-only";

import { getActivityFeed, getEntityDisplayNames } from "@/lib/queries";
import type { ActivityFeedPage } from "@/lib/queries";
import { getOrFetchAlbum, getOrFetchTrack } from "@/lib/spotify-cache";
import type { FeedActivity } from "@/types";

export async function getFeedForUser(
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  return getActivityFeed(userId, limit, cursor);
}

/** Enrich review activities with entity names (album/track) for display. Uses DB first, then spotify-cache for missing. */
export async function enrichFeedActivitiesWithEntityNames(
  activities: FeedActivity[],
): Promise<(FeedActivity & { spotifyName?: string })[]> {
  const reviewItems = activities
    .filter((a): a is FeedActivity & { type: "review" } => a.type === "review")
    .map((a) => ({ entity_type: a.review.entity_type, entity_id: a.review.entity_id }));

  const nameMap = await getEntityDisplayNames(reviewItems);

  return Promise.all(
    activities.map(async (activity) => {
      if (activity.type !== "review") return { ...activity, spotifyName: undefined };
      let name = nameMap.get(activity.review.entity_id);
      if (name == null) {
        try {
          name =
            activity.review.entity_type === "album"
              ? (await getOrFetchAlbum(activity.review.entity_id)).album?.name ?? undefined
              : (await getOrFetchTrack(activity.review.entity_id))?.name;
        } catch {
          name = undefined;
        }
      }
      return { ...activity, spotifyName: name ?? undefined };
    }),
  );
}

/** Enrich listen_session activities with album metadata and track names for display. */
export async function enrichListenSessionsWithAlbums(
  activities: FeedActivity[],
): Promise<FeedActivity[]> {
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

  const [{ getOrFetchAlbumsBatch, getOrFetchTracksBatch }] = await Promise.all([
    import("@/lib/spotify-cache"),
  ]);
  const [albumMap, trackMap] = await Promise.all([
    albumIds.size > 0 ? getOrFetchAlbumsBatch([...albumIds]) : Promise.resolve(new Map()),
    trackIdsNeedingName.size > 0 ? getOrFetchTracksBatch([...trackIdsNeedingName]) : Promise.resolve(new Map()),
  ]);

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
}
