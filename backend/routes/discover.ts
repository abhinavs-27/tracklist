import { Router } from "express";
import { internalError, ok, tooManyRequests } from "../lib/http";
import { checkDiscoverRateLimit } from "../lib/rateLimit";
import { clampLimit } from "../lib/validation";
import {
  getHiddenGemsCached,
  getRisingArtistsCached,
  getTrendingEntitiesCached,
} from "../services/discoverService";
import { enrichUsersWithFollowStatus } from "../services/followService";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { getSession } from "../lib/auth";
import { exampleRisingArtists } from "../lib/exampleData";
import { getChartConfig } from "../lib/chartConfigs";

export const discoverRouter = Router();

discoverRouter.get("/rising-artists", async (req, res) => {
  if (!checkDiscoverRateLimit(req)) return tooManyRequests(res);
  try {
    const limit = clampLimit(req.query.limit, 20, 20);
    const windowDays = Math.min(
      Math.max(1, parseInt(String(req.query.windowDays ?? "7"), 10) || 7),
      90,
    );
    let items;
    try {
      if (!isSupabaseConfigured()) {
        items = exampleRisingArtists(limit);
      } else {
        items = await getRisingArtistsCached(limit, windowDays);
      }
    } catch (e) {
      console.warn("[discover/rising-artists] example fallback:", e);
      items = exampleRisingArtists(limit);
    }
    return ok(res, items);
  } catch (e) {
    return internalError(res, e);
  }
});

discoverRouter.get("/trending", async (req, res) => {
  if (!checkDiscoverRateLimit(req)) return tooManyRequests(res);
  try {
    const limit = clampLimit(req.query.limit, 20, 20);
    const items = isSupabaseConfigured()
      ? await getTrendingEntitiesCached(limit)
      : [];
    return ok(res, items);
  } catch (e) {
    return internalError(res, e);
  }
});

discoverRouter.get("/hidden-gems", async (req, res) => {
  if (!checkDiscoverRateLimit(req)) return tooManyRequests(res);
  try {
    const hiddenGemsConfig = getChartConfig("hidden_gems");
    const defaultMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
    const defaultMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

    const limit = clampLimit(req.query.limit, 20, 20);
    const minRating = Math.min(
      Math.max(
        0,
        parseFloat(String(req.query.minRating ?? String(defaultMinRating))) ||
          defaultMinRating,
      ),
      5,
    );
    const maxListens = Math.min(
      Math.max(
        0,
        parseInt(String(req.query.maxListens ?? String(defaultMaxListens)), 10) ||
          defaultMaxListens,
      ),
      10000,
    );
    const items = isSupabaseConfigured()
      ? await getHiddenGemsCached(limit, minRating, maxListens)
      : [];
    return ok(res, items);
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/discover — users from recent album reviews */
discoverRouter.get("/", async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit, 20, 16);
    if (!isSupabaseConfigured()) {
      return ok(res, { users: [] });
    }

    const supabase = getSupabase();
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("user_id, entity_id, entity_type, created_at")
      .eq("entity_type", "album")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit * 10, 50), 80));

    if (reviewsError) return internalError(res, reviewsError);

    const recentReviews = reviews ?? [];
    const seen = new Set<string>();
    const userIds: string[] = [];
    const latestAlbumByUser = new Map<
      string,
      { spotify_id: string; created_at: string }
    >();

    for (const r of recentReviews) {
      if (!r?.user_id || !r?.entity_id) continue;
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      userIds.push(r.user_id);
      latestAlbumByUser.set(r.user_id, {
        spotify_id: r.entity_id,
        created_at: r.created_at,
      });
      if (userIds.length >= limit) break;
    }

    if (userIds.length === 0) {
      return ok(res, { users: [] });
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, username, avatar_url, bio, created_at")
      .in("id", userIds);

    if (usersError) return internalError(res, usersError);

    const session = await getSession(req);
    const viewerId = session?.id ?? null;

    const enrichedUsers = await enrichUsersWithFollowStatus(
      (users ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        bio: u.bio,
        created_at: u.created_at,
      })),
      viewerId,
    );

    const userMap = new Map(enrichedUsers.map((u) => [u.id, u]));

    const result = userIds
      .map((id) => {
        const u = userMap.get(id);
        if (!u) return null;
        const latest = latestAlbumByUser.get(id);
        return {
          id: u.id,
          username: u.username,
          avatar_url: u.avatar_url,
          latest_album_spotify_id: latest?.spotify_id ?? null,
          latest_log_created_at: latest?.created_at ?? null,
          is_following: u.is_following,
          is_viewer: viewerId ? viewerId === u.id : false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    return ok(res, { users: result });
  } catch (e) {
    return internalError(res, e);
  }
});
