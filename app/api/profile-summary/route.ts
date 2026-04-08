import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { apiBadRequest, apiInternalError } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import {
  getCachedRecentAlbumsFromLogs,
  getCachedRecentTracksFromLogs,
} from "@/lib/profile/recent-activity-cache";
import type { RecentAlbumItem, RecentTrackRow } from "@/lib/recent-from-logs";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";
import { viewerSeesUserLogs } from "@/lib/privacy/logs-private";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ProfileSummaryResponse = {
  user_id: string;
  albums: RecentAlbumItem[];
  /** Spotify / log-backed plays — only populated when viewer is the profile owner. */
  recent_tracks: RecentTrackRow[];
  tracks_has_more: boolean;
};

/**
 * Aggregated lightweight profile activity for one user (single round-trip).
 * `recent_tracks` + Spotify sync only when the viewer is signed in as that user
 * (same contract as separate `/api/spotify/recently-played`).
 */
export async function GET(request: NextRequest) {
  try {
    const viewer = await getUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId || !isValidUuid(userId)) {
      return apiBadRequest("Valid user_id required");
    }

    const bust = searchParams.get("refresh") === "1";

    const albumsLimitRaw = searchParams.get("albums_limit");
    const albumsLimit = albumsLimitRaw
      ? Math.min(48, Math.max(1, parseInt(albumsLimitRaw, 10) || 12))
      : 12;

    const tracksLimitRaw = searchParams.get("tracks_limit");
    const tracksLimit = Math.min(
      50,
      Math.max(1, parseInt(tracksLimitRaw ?? "8", 10) || 8),
    );

    const viewerKey = viewer?.id ?? "anon";
    const cacheKey = `profile:summary:${userId}:${viewerKey}:${albumsLimit}:${tracksLimit}`;

    return staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.profileSummary,
      STALE_FIRST_STALE_AFTER_SEC.profileSummary,
      async () => {
        const isOwnProfile = !!viewer && viewer.id === userId;

        const admin = createSupabaseAdminClient();
        const { data: privacyRow } = await admin
          .from("users")
          .select("logs_private")
          .eq("id", userId)
          .maybeSingle();
        const logsPrivate = Boolean(
          (privacyRow as { logs_private?: boolean } | null)?.logs_private,
        );
        const canSeeLogDerived = viewerSeesUserLogs(
          viewer?.id ?? null,
          userId,
          logsPrivate,
        );

        const [albums, tracksBlock] = await Promise.all([
          canSeeLogDerived
            ? getCachedRecentAlbumsFromLogs(userId, albumsLimit, bust)
            : Promise.resolve([] as RecentAlbumItem[]),
          isOwnProfile
            ? getCachedRecentTracksFromLogs(userId, tracksLimit, 0, {
                bust,
                trySpotifySync: true,
              })
            : Promise.resolve({ items: [] as RecentTrackRow[], hasMore: false }),
        ]);

        const payload: ProfileSummaryResponse = {
          user_id: userId,
          albums,
          recent_tracks: tracksBlock.items,
          tracks_has_more: tracksBlock.hasMore,
        };

        return payload;
      },
      { bypassCache: bust },
    );
  } catch (e) {
    return apiInternalError(e);
  }
}
