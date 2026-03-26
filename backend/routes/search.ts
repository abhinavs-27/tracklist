import { Router } from "express";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { searchSpotify } from "../lib/spotify";
import {
  clampLimit,
  LIMITS,
  sanitizeString,
  validateSearchQuery,
} from "../lib/validation";
import { getSessionUserId } from "../lib/auth";
import { searchUsers } from "../services/userSearchService";
import { enrichUsersWithFollowStatus } from "../services/followService";
import { isSupabaseConfigured } from "../lib/supabase";

type SearchType = "artist" | "album" | "track";

export const searchRouter = Router();

const MIN_USER_QUERY = 2;
const MAX_USER_QUERY = 50;

searchRouter.get("/users", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const raw = String(req.query.q ?? "");
    const q = sanitizeString(raw, MAX_USER_QUERY) ?? "";
    if (q.length < MIN_USER_QUERY) {
      return badRequest(
        res,
        `Query must be at least ${MIN_USER_QUERY} characters`,
      );
    }

    if (!isSupabaseConfigured()) {
      return ok(res, []);
    }

    const limit = clampLimit(req.query.limit, 50, 20);
    const rows = await searchUsers(q, limit, userId);
    if (rows.length === 0) return ok(res, []);

    const users = await enrichUsersWithFollowStatus(rows, userId);
    return ok(res, users);
  } catch (e) {
    return internalError(res, e);
  }
});

searchRouter.get("/", async (req, res) => {
  try {
    const rawQ = req.query.q as string | undefined;
    const typeParam = (req.query.type as string) || "artist,album,track";
    const limit = clampLimit(req.query.limit, LIMITS.SEARCH_LIMIT, 10);

    const queryResult = validateSearchQuery(rawQ);
    if (!queryResult.ok) return badRequest(res, queryResult.error);

    const requestedTypes = typeParam
      .split(",")
      .map((t) => t.trim())
      .filter((t): t is SearchType => t === "artist" || t === "album" || t === "track");

    const searchTypes: SearchType[] =
      requestedTypes.length > 0 ? requestedTypes : ["artist", "album", "track"];

    const result = await searchSpotify(queryResult.value, searchTypes, limit);
    return ok(res, result);
  } catch (e) {
    return internalError(res, e);
  }
});
