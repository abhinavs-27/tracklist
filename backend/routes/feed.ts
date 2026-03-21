import { Router } from "express";
import { getSessionUserId } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { unauthorized, internalError, ok, badRequest } from "../lib/http";
import { clampLimit, LIMITS } from "../lib/validation";
import {
  enrichFeedResponse,
  getActivityFeedForExpress,
} from "../services/activityFeedService";

export const feedRouter = Router();

/**
 * GET /api/feed — same contract as Next.js `app/api/feed/route.ts` (no proxy required).
 */
feedRouter.get("/feed", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    if (!isSupabaseConfigured()) {
      return badRequest(res, "Supabase is not configured on this server");
    }

    const limit = clampLimit(req.query.limit, LIMITS.FEED_LIMIT, 50);
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor.trim() || null : null;

    const supabase = getSupabase();
    const page = await getActivityFeedForExpress(
      supabase,
      userId,
      limit,
      cursor,
    );
    try {
      const { items, nextCursor } = await enrichFeedResponse(supabase, page);
      return ok(res, { items, nextCursor });
    } catch (enrichErr) {
      console.warn("[feed] enrichment failed (Spotify or DB); returning core feed", enrichErr);
      return ok(res, { items: page.items, nextCursor: page.next_cursor });
    }
  } catch (e) {
    return internalError(res, e);
  }
});
