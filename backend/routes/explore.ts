import { Router } from "express";
import { internalError, ok } from "../lib/http";
import { isSupabaseConfigured } from "../lib/supabase";
import { getExploreHubPayload } from "../services/exploreHubService";

export const exploreRouter = Router();

const STATIC_DISCOVER = {
  headline: "Discover",
  description: "Rising artists, hidden gems, and personalized picks.",
  links: [
    { href: "/discover", label: "Go to Discover", variant: "primary" as const },
    {
      href: "/discover/recommended",
      label: "For you",
      variant: "secondary" as const,
    },
  ],
};

/**
 * GET /api/explore — same contract as Next.js `app/api/explore/route.ts` (hub v2).
 * Implemented natively on Express so mobile works when only the backend is running
 * (no proxy to Next.js on :3000). `discover` is static; `reviews` is empty here.
 */
exploreRouter.get("/explore", async (_req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return ok(res, {
        trending: [],
        leaderboard: [],
        discover: STATIC_DISCOVER,
        reviews: [],
      });
    }
    const payload = await getExploreHubPayload();
    return ok(res, {
      ...payload,
      discover: STATIC_DISCOVER,
      reviews: [],
    });
  } catch (e) {
    return internalError(res, e);
  }
});
