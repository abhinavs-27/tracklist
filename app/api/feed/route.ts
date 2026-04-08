import { withHandler } from "@/lib/api-handler";
import { LIMITS } from "@/lib/validation";
import { fetchFeedEnrichedPayload, feedStaleFirstCacheKey } from "@/lib/feed";
import { getPaginationParams } from "@/lib/api-utils";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

/**
 * GET /api/feed?limit=<1-100>&cursor=<ISO timestamp>.
 * Same activity feed as web (`getFeedForUser` + enrichment): reviews, follows, listen sessions.
 * Returns { items: FeedActivity[], nextCursor, events, fetched_at } — items merge v2 stories + legacy activity.
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
    const bypassCache = searchParams.get("refresh") === "1";

    const userId = me!.id;
    const cacheKey = feedStaleFirstCacheKey(userId, limit, cursor);

    return staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.feed,
      STALE_FIRST_STALE_AFTER_SEC.feed,
      () => fetchFeedEnrichedPayload(userId, limit, cursor),
      { bypassCache },
    );
  },
  { requireAuth: true },
);
