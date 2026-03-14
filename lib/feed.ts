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
