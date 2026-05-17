import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { getFollowCounts, getUserStreak } from "@/lib/queries";

/** GET /api/users/me — own profile for mobile (uses Bearer token auth). */
export const GET = withHandler(
  async (_request, { user: me }) => {
    const admin = createSupabaseAdminClient();
    const [userRow, followCounts, streak] = await Promise.all([
      admin
        .from("users")
        .select("id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, logs_private")
        .eq("id", me!.id)
        .maybeSingle(),
      getFollowCounts(me!.id),
      getUserStreak(me!.id).catch(() => null),
    ]);
    if (!userRow.data) return apiNotFound("User not found");
    const u = userRow.data as {
      id: string; username: string; avatar_url: string | null; bio: string | null;
      created_at: string; lastfm_username: string | null; lastfm_last_synced_at: string | null; logs_private: boolean;
    };
    return apiOk({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      bio: u.bio,
      created_at: u.created_at,
      lastfm_username: u.lastfm_username,
      lastfm_last_synced_at: u.lastfm_last_synced_at,
      followers_count: followCounts.followers_count,
      following_count: followCounts.following_count,
      is_following: false,
      is_own_profile: true,
      current_streak: streak?.current_streak ?? 0,
      longest_streak: streak?.longest_streak ?? 0,
    });
  },
  { requireAuth: true },
);
import { parseBody } from "@/lib/api-utils";
import { ProfileUpdateBody } from "@/types";
import {
  validateUsernameUpdate,
  validateBio,
  validateLastfmUsername,
} from "@/lib/validation";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    const supabase = await createSupabaseServerClient();

    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("id, username, bio, lastfm_username, onboarding_completed")
      .eq("id", me!.id)
      .maybeSingle();
    if (currentError || !current) {
      return apiInternalError(currentError ?? new Error("User not found"));
    }

    const updates: {
      username?: string;
      bio?: string | null;
      lastfm_username?: string | null;
      lastfm_last_synced_at?: string | null;
      onboarding_completed?: boolean;
    } = {};

    if (body!.username !== undefined) {
      const usernameResult = validateUsernameUpdate(body!.username);
      if (!usernameResult.ok) return apiBadRequest(usernameResult.error);
      const newUsername = usernameResult.value;
      if (current.username !== newUsername) {
        const { data: existing, error: existingError } = await supabase
          .from("users")
          .select("id")
          .eq("username", newUsername)
          .maybeSingle();
        if (existingError) return apiInternalError(existingError);
        if (existing && existing.id !== current.id) {
          return apiConflict("Username is already taken");
        }
      }
      updates.username = newUsername;
    }

    if (body!.bio !== undefined) {
      updates.bio = validateBio(body!.bio);
    }

    if (body!.lastfm_username !== undefined) {
      const lastfmResult = validateLastfmUsername(body!.lastfm_username);
      if (!lastfmResult.ok) return apiBadRequest(lastfmResult.error);
      const nextLf = lastfmResult.value;
      const prevLf = current.lastfm_username ?? null;
      if (
        nextLf !== null &&
        nextLf !== prevLf
      ) {
        const check = await fetchLastfmRecentTracksSafe(nextLf, 1);
        if (!check.ok) {
          return apiBadRequest(
            check.errorCode === "invalid_user"
              ? "Last.fm user not found — check the username or create an account at last.fm/join"
              : check.error,
          );
        }
      }
      updates.lastfm_username = lastfmResult.value;
      if (lastfmResult.value === null) {
        updates.lastfm_last_synced_at = null;
      }
    }

    if (body!.onboarding_completed !== undefined) {
      if (typeof body!.onboarding_completed !== "boolean") {
        return apiBadRequest("onboarding_completed must be a boolean");
      }
      updates.onboarding_completed = body!.onboarding_completed;
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("No fields to update");
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", me!.id)
      .select(
        "id, email, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed",
      )
      .maybeSingle();

    if (updateError || !updated) {
      return apiInternalError(updateError ?? new Error("Update failed"));
    }

    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(updates),
    });

    return apiOk(updated);
  },
  { requireAuth: true }
);

