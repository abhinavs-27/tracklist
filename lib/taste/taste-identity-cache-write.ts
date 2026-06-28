import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TasteIdentity } from "./types";

/**
 * EMPTY-equivalent: no logs AND no surfaced entities of any kind.
 *
 * `computeTasteIdentity` returns the `EMPTY` constant both when a user genuinely
 * has no data and — critically — when its underlying reads (`getTotalPlayCount`,
 * `getAllTimeAgg`, ratings) all transiently fail, since those helpers swallow
 * errors and return 0/[]. This predicate lets the writer treat such a result as
 * "no signal" so it never clobbers a populated cache.
 *
 * Cold-start seeds (0 logs but real `topAlbums`/`topArtists` from onboarding
 * ratings/favorites) are NOT empty — they carry signal and should persist.
 */
export function isEmptyTasteIdentity(
  t: Pick<TasteIdentity, "totalLogs" | "topArtists" | "topAlbums" | "topGenres">,
): boolean {
  return (
    (t.totalLogs ?? 0) === 0 &&
    (t.topArtists?.length ?? 0) === 0 &&
    (t.topAlbums?.length ?? 0) === 0 &&
    (t.topGenres?.length ?? 0) === 0
  );
}

/** Raw upsert into `taste_identity_cache` (no guard). */
export async function upsertTasteIdentityCache(
  admin: SupabaseClient,
  userId: string,
  payload: TasteIdentity,
): Promise<void> {
  const { error } = await admin.from("taste_identity_cache").upsert(
    {
      user_id: userId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.warn("[taste-identity] cache upsert failed", error);
  }
}

/**
 * Persist a freshly computed identity, but NEVER overwrite a populated cache with
 * an empty recompute.
 *
 * A transient DB failure inside `computeTasteIdentity` yields the `EMPTY` constant
 * even for users with tens of thousands of logs (the read helpers swallow errors
 * and return 0/[]). Persisting that wipes the user's taste profile — and because
 * the self-healing refresh only runs weekly, the damage can persist for days.
 * Guarding the write here is the durable fix.
 *
 * Returns whatever is now authoritative for the cache (the preserved prior payload
 * when we skip, otherwise the value we wrote).
 */
export async function persistTasteIdentityNoClobber(
  admin: SupabaseClient,
  userId: string,
  computed: TasteIdentity,
): Promise<TasteIdentity> {
  if (isEmptyTasteIdentity(computed)) {
    const { data: existing } = await admin
      .from("taste_identity_cache")
      .select("payload")
      .eq("user_id", userId)
      .maybeSingle();

    const prev = existing?.payload as TasteIdentity | undefined;
    if (prev && !isEmptyTasteIdentity(prev)) {
      console.warn(
        "[taste-identity] skipping empty recompute over populated cache — likely a transient read failure",
        { userId, prevTotalLogs: prev.totalLogs },
      );
      return prev;
    }
  }

  await upsertTasteIdentityCache(admin, userId, computed);
  return computed;
}
