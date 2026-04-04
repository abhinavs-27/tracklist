import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  artistIdsFromAlbumIds as artistIdsFromAlbumIdsImpl,
  getTasteOverlapSuggestionsForViewerWithClient,
  type TasteOverlapSuggestion,
} from "@/lib/user-search-directory";

export type { TasteOverlapSuggestion };

/** Onboarding API + UI (same rows as taste overlap, without internal score). */
export type OnboardingSuggestedUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  followers_count: number;
  reasons: string[];
};

export const artistIdsFromAlbumIds = artistIdsFromAlbumIdsImpl;

/**
 * Suggest users by scanning others' recent `logs`: rows whose `album_id` is one of your
 * favorite albums, or whose `artist_id` is an artist on those albums. Ranks by overlap
 * volume and builds human-readable reason lines.
 */
export async function getTasteOverlapSuggestionsForViewer(
  viewerId: string,
  options?: { limit?: number },
): Promise<TasteOverlapSuggestion[]> {
  const admin = createSupabaseAdminClient();
  return getTasteOverlapSuggestionsForViewerWithClient(admin, viewerId, options);
}

export async function getOnboardingFollowSuggestions(
  userId: string,
): Promise<OnboardingSuggestedUser[]> {
  const rows = await getTasteOverlapSuggestionsForViewer(userId, { limit: 10 });
  return rows.map(({ score: _s, ...rest }) => rest);
}
