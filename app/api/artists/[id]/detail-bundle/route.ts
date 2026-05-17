import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getArtistIdByExternalId } from "@/lib/catalog/entity-resolution";
import {
  fetchArtistViewerStats,
  fetchArtistRecentListens,
} from "@/lib/artist-db-feed";
import { getArtistFriendLeaderboard, getReviewsForArtist } from "@/lib/queries";

export const GET = withHandler(
  async (_request, ctx) => {
    const { id } = ctx.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) {
      return apiBadRequest("Invalid artist id");
    }

    const supabase = await createSupabaseServerClient();
    const uid = ctx.user?.id ?? null;

    // Resolve to canonical UUID (handles both Spotify IDs and UUIDs)
    let canonicalId = id;
    if (isValidSpotifyId(id)) {
      const resolved = await getArtistIdByExternalId(supabase, "spotify", id);
      canonicalId = resolved ?? id;
    }

    const [viewerStatsRes, recentListensRes, leaderboardRes, reviewsRes] =
      await Promise.allSettled([
        uid ? fetchArtistViewerStats(canonicalId, uid) : Promise.resolve(null),
        fetchArtistRecentListens(canonicalId, uid),
        uid ? getArtistFriendLeaderboard(uid, canonicalId) : Promise.resolve([]),
        getReviewsForArtist(canonicalId, 6),
      ]);

    return apiOk({
      viewerStats: viewerStatsRes.status === "fulfilled" ? viewerStatsRes.value : null,
      recentListens: recentListensRes.status === "fulfilled" ? recentListensRes.value : [],
      leaderboard: leaderboardRes.status === "fulfilled" ? (leaderboardRes.value ?? []) : [],
      reviews: reviewsRes.status === "fulfilled" ? reviewsRes.value : [],
    });
  },
  { requireAuth: false },
);
