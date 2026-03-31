import { Router } from "express";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidUuid } from "../lib/validation";
import { getRecentAlbumsFromLogs } from "../lib/recentAlbumsFromLogs";
import { badRequest, internalError, ok } from "../lib/http";

const MAX_ALBUMS = 12;

/**
 * GET /api/recent-albums?user_id= — recent unique albums from `logs` + catalog.
 */
export const recentAlbumsRouter = Router();

recentAlbumsRouter.get("/", async (req, res) => {
  try {
    const userId = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (!userId || !isValidUuid(userId)) {
      return badRequest(res, "Valid user_id required");
    }
    if (!isSupabaseConfigured()) {
      return internalError(res, "Server misconfigured");
    }

    const supabase = getSupabase();
    const albums = await getRecentAlbumsFromLogs(supabase, userId, MAX_ALBUMS);
    return ok(res, { albums });
  } catch (e) {
    return internalError(res, e);
  }
});
