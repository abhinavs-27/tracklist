import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getValidSpotifyAccessToken } from "@/lib/spotify-user";
import { syncRecentlyPlayed } from "@/lib/spotify-sync";
import { apiUnauthorized, apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TRACKS = 50;

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const userId = session.user.id;
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
          return apiOk({ items: [] });
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
      .limit(MAX_TRACKS);

    if (error) return apiInternalError(error);

    return apiOk({
      items: tracks ?? [],
    });
  } catch (e) {
    return apiInternalError(e);
  }
}
