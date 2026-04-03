import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { clampLimit, LIMITS } from "@/lib/validation";
import { getMergedActivityFeed } from "@/lib/feed/merged-feed";
import {
  enrichFeedActivitiesWithEntityNames,
  enrichListenSessionsWithAlbums,
} from "@/lib/feed";

/**
 * GET /api/feed?limit=<1-100>&cursor=<ISO timestamp>.
 * Same activity feed as web (`getFeedForUser` + enrichment): reviews, follows, listen sessions.
 * Returns { items: FeedActivity[], nextCursor, events } — items merge v2 stories + legacy activity.
 */
export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(
      searchParams.get("limit"),
      LIMITS.FEED_LIMIT,
      50,
    );
    const cursor = searchParams.get("cursor")?.trim() || null;

    const { items, next_cursor } = await getMergedActivityFeed(me.id, limit, cursor);

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
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
