import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { LIMITS } from "@/lib/validation";
import { getMergedActivityFeed } from "@/lib/feed/merged-feed";
import {
  enrichFeedActivitiesWithEntityNames,
  enrichListenSessionsWithAlbums,
} from "@/lib/feed";
import { getPaginationParams } from "@/lib/api-utils";

/**
 * GET /api/feed?limit=<1-100>&cursor=<ISO timestamp>.
 * Same activity feed as web (`getFeedForUser` + enrichment): reviews, follows, listen sessions.
 * Returns { items: FeedActivity[], nextCursor, events } — items merge v2 stories + legacy activity.
 */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const { limit } = getPaginationParams(
      searchParams,
      50,
      LIMITS.FEED_LIMIT,
    );
    const cursor = searchParams.get("cursor")?.trim() || null;

    const { items, next_cursor } = await getMergedActivityFeed(me!.id, limit, cursor);

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
    return apiOk({
      items: enrichedList,
      nextCursor: next_cursor,
      events,
    });
  },
  { requireAuth: true },
);
