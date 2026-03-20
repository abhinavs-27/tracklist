import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { clampLimit, LIMITS } from "@/lib/validation";
import {
  getActivityFeed,
  type FeedEvent,
} from "@/lib/queries/feed";

/**
 * GET /api/feed?limit=<1-100>&cursor=<ISO timestamp>.
 * Returns a unified, cursor-paginated feed:
 * { items: FeedEvent[], nextCursor: string | null }.
 */
export async function GET(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(
      searchParams.get("limit"),
      LIMITS.FEED_LIMIT,
      50,
    );
    const cursor = searchParams.get("cursor")?.trim() || null;

    const items: FeedEvent[] = await getActivityFeed(
      session.user.id,
      limit,
      cursor,
    );

    const nextCursor =
      items.length === limit ? items[items.length - 1]?.createdAt ?? null : null;

    return apiOk({ items, nextCursor });
  } catch (e) {
    return apiInternalError(e);
  }
}
