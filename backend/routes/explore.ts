import { Router } from "express";
import { internalError, ok } from "../lib/http";
import { isSupabaseConfigured } from "../lib/supabase";
import { getExploreHubPayload } from "../services/exploreHubService";

export const exploreRouter = Router();

/**
 * GET /api/explore — same contract as Next.js `app/api/explore/route.ts`.
 * Implemented natively on Express so mobile works when only the backend is running
 * (no proxy to Next.js on :3000).
 */
exploreRouter.get("/explore", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return ok(res, { trending: [], leaderboard: [] });
    }
    const payload = await getExploreHubPayload();
    return ok(res, payload);
  } catch (e) {
    return internalError(res, e);
  }
});
