import { Router } from "express";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidUuid } from "../../lib/validation";
import { getRecentAlbumsFromLogs } from "../lib/recentAlbumsFromLogs";

const MAX_ALBUMS = 12;

/**
 * GET /api/recent-albums?user_id= — recent unique albums from `logs` + catalog.
 */
export const recentAlbumsRouter = Router();

recentAlbumsRouter.get("/", async (req, res, next) => {
  try {
    const userId = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (!userId || !isValidUuid(userId)) {
      res.status(400).json({ error: "Valid user_id required" });
      return;
    }
    if (!isSupabaseConfigured()) {
      res.status(500).json({ error: "Server misconfigured" });
      return;
    }

    const supabase = getSupabase();
    const albums = await getRecentAlbumsFromLogs(supabase, userId, MAX_ALBUMS);
    res.status(200).json({ albums });
  } catch (e) {
    next(e);
  }
});
