import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getValidSpotifyAccessToken } from "@/lib/spotify-user";
import { syncRecentlyPlayed } from "@/lib/spotify-sync";
import { getRecentTracksFromLogs } from "@/lib/recent-from-logs";
import { apiOk, apiTooManyRequests } from "@/lib/api-response";
import { isSpotifyIntegrationEnabled } from "@/lib/spotify-integration-enabled";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

const MAX_LIMIT = 50;

export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }

  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"), MAX_LIMIT, 50);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const userId = me!.id;
  const supabase = createSupabaseAdminClient();

  if (offset === 0 && isSpotifyIntegrationEnabled()) {
    try {
      const accessToken = await getValidSpotifyAccessToken(userId);
      await syncRecentlyPlayed(userId, accessToken);
    } catch (e) {
      if (e instanceof Error && e.message === "Spotify not connected") {
        // Fall through — show listens from logs only (Last.fm, manual, etc.)
      } else {
        console.warn("[recently-played] syncRecentlyPlayed skipped", e);
      }
    }
  }

  const { items, hasMore } = await getRecentTracksFromLogs(
    supabase,
    userId,
    limit,
    offset,
  );

  return apiOk({ items, hasMore });
}, { requireAuth: true });
