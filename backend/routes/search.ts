import { Router } from "express";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { searchSpotify } from "../lib/spotify";
import {
  clampLimit,
  LIMITS,
  sanitizeString,
  validateSearchQuery,
} from "../../lib/validation";
import { getSessionUserId } from "../lib/auth";
import { searchUsers } from "../services/userSearchService";
import { enrichUsersWithFollowStatus } from "../services/followService";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import {
  getTasteOverlapSuggestionsForViewerWithClient,
  listUsersByCreatedAtWithClient,
} from "../../lib/user-search-directory";

type SearchType = "artist" | "album" | "track";

export const searchRouter = Router();

const MIN_USER_QUERY = 2;
const MAX_USER_QUERY = 50;

const BROWSE_DEFAULT_LIMIT = 10;
const BROWSE_MAX_LIMIT = 50;
const TASTE_OVERLAP_DEFAULT_LIMIT = 10;
const TASTE_OVERLAP_MAX_LIMIT = 20;

/** `GET /api/search/users/browse` — native (no Next.js proxy); required for mobile on :3001. */
searchRouter.get("/users/browse", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);

    if (!isSupabaseConfigured()) {
      return ok(res, { users: [], hasMore: false });
    }

    const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
    const rawLimit = parseInt(
      String(req.query.limit ?? String(BROWSE_DEFAULT_LIMIT)),
      10,
    );
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, BROWSE_MAX_LIMIT)
      : BROWSE_DEFAULT_LIMIT;

    const overfetch = Math.min(limit + 1, BROWSE_MAX_LIMIT + 1);
    // Shared `lib/` types `SupabaseClient` from the repo root; Express has its own
    // `node_modules/@supabase/supabase-js` — runtime is identical.
    const rows = await listUsersByCreatedAtWithClient(
      getSupabase() as never,
      overfetch,
      offset,
      userId ?? null,
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const users = await enrichUsersWithFollowStatus(page, userId ?? null);

    return ok(res, { users, hasMore });
  } catch (e) {
    return internalError(res, e);
  }
});

/** `GET /api/search/users/taste-overlap` — native (no Next.js proxy). */
searchRouter.get("/users/taste-overlap", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    if (!isSupabaseConfigured()) {
      return ok(res, { users: [] });
    }

    const raw = parseInt(
      String(req.query.limit ?? String(TASTE_OVERLAP_DEFAULT_LIMIT)),
      10,
    );
    const lim = Number.isFinite(raw) && raw >= 1
      ? Math.min(raw, TASTE_OVERLAP_MAX_LIMIT)
      : TASTE_OVERLAP_DEFAULT_LIMIT;

    const rows = await getTasteOverlapSuggestionsForViewerWithClient(
      getSupabase() as never,
      userId,
      {
        limit: lim,
      },
    );
    const withoutScore = rows.map(({ score: _s, ...u }) => u);
    const users = await enrichUsersWithFollowStatus(withoutScore, userId);

    return ok(res, { users });
  } catch (e) {
    return internalError(res, e);
  }
});

searchRouter.get("/users", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);

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
    const rows = await searchUsers(q, limit, userId ?? null);
    if (rows.length === 0) return ok(res, []);

    const users = await enrichUsersWithFollowStatus(rows, userId ?? null);
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
