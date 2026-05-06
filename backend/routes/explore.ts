import { Router } from "express";
import { internalError, ok } from "../lib/http";
import { isSupabaseConfigured } from "../lib/supabase";
import { getExploreHubPayload } from "../services/exploreHubService";
import {
  getExploreDiscoveryBundle,
  type ExploreRangeParam,
} from "../services/exploreDiscoveryService";

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
 * GET /api/explore/discovery-bundle — same contract as Next.js route handler.
 * Used by the mobile app explore tab.
 */
exploreRouter.get("/explore/discovery-bundle", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return ok(res, {
      range: "week",
      blowing_up: [],
      most_talked_about: [],
      most_loved: [],
      hidden_gems: [],
      across_communities: [],
    });
  }
  try {
    const raw = String(req.query.range ?? "week").trim().toLowerCase();
    const range: ExploreRangeParam = raw === "24h" || raw === "day" ? "24h" : "week";
    const bundle = await getExploreDiscoveryBundle(range);
    return ok(res, bundle);
  } catch (e) {
    return internalError(res, e);
  }
});

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
