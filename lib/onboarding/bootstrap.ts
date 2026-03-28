import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getOrFetchAlbumsBatch } from "@/lib/spotify-cache";
import { seedTasteIdentityFromFavoriteAlbums } from "@/lib/taste/taste-identity";

export type {
  OnboardingSuggestedUser,
} from "@/lib/onboarding/taste-overlap-suggestions";
export {
  artistIdsFromAlbumIds,
  getOnboardingFollowSuggestions,
} from "@/lib/onboarding/taste-overlap-suggestions";

const MIN_ALBUMS = 1;
const MAX_ALBUMS = 4;

export type OnboardingBootstrapResult = {
  ok: true;
  followedCount: number;
};

export async function saveFavoriteAlbums(
  admin: SupabaseClient,
  userId: string,
  albumIds: string[],
): Promise<void> {
  await admin.from("user_favorite_albums").delete().eq("user_id", userId);
  const rows = albumIds.map((album_id, i) => ({
    user_id: userId,
    album_id,
    position: i + 1,
  }));
  if (rows.length === 0) return;
  const { error } = await admin.from("user_favorite_albums").insert(rows);
  if (error) {
    console.error("[onboarding] user_favorite_albums insert failed", error);
    throw error;
  }
  const { error: syncErr } = await admin.rpc(
    "sync_favorite_counts_from_user_favorite_albums",
  );
  if (syncErr) {
    console.warn("[onboarding] sync_favorite_counts_from_user_favorite_albums", syncErr);
  }
}

/**
 * Persist favorite albums (when `albumIds` passed), hydrate catalog, seed taste cache, complete onboarding.
 * If `albumIds` is omitted or empty, uses existing `user_favorite_albums` rows.
 */
export async function runOnboardingBootstrap(
  userId: string,
  albumIds?: string[] | null,
): Promise<OnboardingBootstrapResult> {
  const admin = createSupabaseAdminClient();

  let trimmed: string[];
  if (albumIds != null && albumIds.length > 0) {
    trimmed = [...new Set(albumIds.map((id) => id.trim()).filter(Boolean))].slice(
      0,
      MAX_ALBUMS,
    );
  } else {
    const { data: favRows, error: favErr } = await admin
      .from("user_favorite_albums")
      .select("album_id")
      .eq("user_id", userId)
      .order("position", { ascending: true });
    if (favErr) {
      console.error("[onboarding] bootstrap read favorites failed", favErr);
      throw favErr;
    }
    trimmed = (favRows ?? []).map(
      (r) => (r as { album_id: string }).album_id,
    );
  }

  if (trimmed.length < MIN_ALBUMS) {
    throw new Error(`Pick at least ${MIN_ALBUMS} album.`);
  }

  await getOrFetchAlbumsBatch(trimmed);

  await saveFavoriteAlbums(admin, userId, trimmed);
  await seedTasteIdentityFromFavoriteAlbums(userId, trimmed);

  const { error: doneErr } = await admin
    .from("users")
    .update({ onboarding_completed: true })
    .eq("id", userId);
  if (doneErr) {
    console.error("[onboarding] onboarding_completed update failed", doneErr);
    throw doneErr;
  }

  return { ok: true, followedCount: 0 };
}
