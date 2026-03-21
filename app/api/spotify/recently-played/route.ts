import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getValidSpotifyAccessToken } from "@/lib/spotify-user";
import { syncRecentlyPlayed } from "@/lib/spotify-sync";
import { apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const me = await requireApiAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), MAX_LIMIT, 50);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const userId = me.id;
    const supabase = createSupabaseAdminClient();

    // Last sync: max(created_at) for this user (when we last wrote to cache)
    const { data: lastSyncRow } = await supabase
      .from("spotify_recent_tracks")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastSyncAt = lastSyncRow?.created_at ? new Date(lastSyncRow.created_at).getTime() : 0;
    const now = Date.now();
    const useCache = lastSyncAt > 0 && now - lastSyncAt < CACHE_TTL_MS;

    if (!useCache) {
      let accessToken: string;
      try {
        accessToken = await getValidSpotifyAccessToken(userId);
      } catch (e) {
        if (e instanceof Error && e.message === "Spotify not connected") {
          return apiOk({ items: [], hasMore: false });
        }
        return apiInternalError(e);
      }
      await syncRecentlyPlayed(userId, accessToken);
    }

    const { data: tracks, error } = await supabase
      .from("spotify_recent_tracks")
      .select("track_id, track_name, artist_name, album_id, album_name, album_image, played_at")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return apiInternalError(error);

    const items = tracks ?? [];
    const hasMore = items.length === limit;

    return apiOk({ items, hasMore });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
