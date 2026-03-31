import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import {
  getCachedRecentAlbumsFromLogs,
  getCachedRecentTracksFromLogs,
} from "@/lib/profile/recent-activity-cache";
import type { RecentAlbumItem, RecentTrackRow } from "@/lib/recent-from-logs";

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

    const isOwnProfile = !!viewer && viewer.id === userId;

    const [albums, tracksBlock] = await Promise.all([
      getCachedRecentAlbumsFromLogs(userId, albumsLimit, bust),
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

    return apiOk(payload);
  } catch (e) {
    return apiInternalError(e);
  }
}
