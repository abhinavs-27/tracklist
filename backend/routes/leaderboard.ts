import { Router } from "express";
import { badRequest, internalError, ok } from "../lib/http";
import {
  getLeaderboardWithTotal,
  type LeaderboardFilters,
} from "../services/leaderboardService";
import { isSupabaseConfigured } from "../lib/supabase";
import { exampleLeaderboardItems } from "../lib/exampleData";

export const leaderboardRouter = Router();

/**
 * GET /api/leaderboard
 * Query: type | metric (popular | topRated | mostFavorited), entity (song|album), startYear, endYear, cursor, limit
 */
leaderboardRouter.get("/", async (req, res) => {
  try {
    const typeParam = (req.query.type ?? req.query.metric) as string | undefined;
    const startYearParam = req.query.startYear as string | undefined;
    const endYearParam = req.query.endYear as string | undefined;
    const entityParam = req.query.entity as string | undefined;
    const cursorParam = req.query.cursor as string | undefined;
    const limitParam = req.query.limit as string | undefined;

    const validTypes = ["popular", "topRated", "mostFavorited"] as const;
    if (!typeParam || !(validTypes as readonly string[]).includes(typeParam)) {
      return badRequest(
        res,
        "type (or metric) must be 'popular', 'topRated', or 'mostFavorited'",
      );
    }
    const type = typeParam as (typeof validTypes)[number];

    const filters: LeaderboardFilters = {};
    if (startYearParam) {
      const startYear = parseInt(startYearParam, 10);
      if (isNaN(startYear) || startYear < 1900 || startYear > 2100) {
        return badRequest(res, "startYear must be a valid year");
      }
      filters.startYear = startYear;
    }
    if (endYearParam) {
      const endYear = parseInt(endYearParam, 10);
      if (isNaN(endYear) || endYear < 1900 || endYear > 2100) {
        return badRequest(res, "endYear must be a valid year");
      }
      filters.endYear = endYear;
    }

    const entity: "song" | "album" =
      entityParam === "album" || entityParam === "song" ? entityParam : "song";

    const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 10), 100)
      : 50;

    const startRank = cursor && cursor > 0 ? cursor + 1 : 1;
    const startIndex = startRank - 1;

    let pageItems: Awaited<
      ReturnType<typeof getLeaderboardWithTotal>
    >["entries"];
    let totalCount: number | null = null;

    try {
      if (!isSupabaseConfigured()) {
        const allEntries = exampleLeaderboardItems(
          type,
          entity,
          Math.min(startIndex + limit, 50),
        );
        pageItems = allEntries.slice(startIndex, startIndex + limit);
      } else {
        const r = await getLeaderboardWithTotal(
          type,
          filters,
          entity,
          limit,
          startIndex,
        );
        pageItems = r.entries;
        totalCount = r.totalCount;
      }
    } catch (e) {
      console.warn("[leaderboard] falling back to example data:", e);
      const allEntries = exampleLeaderboardItems(
        type,
        entity,
        Math.min(startIndex + limit, 50),
      );
      pageItems = allEntries.slice(startIndex, startIndex + limit);
    }

    if (pageItems.length === 0) {
      return ok(res, { items: [], nextCursor: null, total: totalCount ?? 0 });
    }

    const lastRank = startIndex + pageItems.length;
    const hasMore =
      totalCount != null
        ? lastRank < totalCount
        : pageItems.length === limit;
    const nextCursor = hasMore ? lastRank : null;

    return ok(res, {
      items: pageItems,
      nextCursor,
      total: totalCount ?? undefined,
    });
  } catch (e) {
    return internalError(res, e);
  }
});
