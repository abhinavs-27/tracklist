import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { ProfileQuickActions } from "@/components/profile/profile-quick-actions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUuid } from "@/lib/validation";
import {
  getCachedUserFavoriteAlbums,
} from "@/lib/profile/cached-profile-data";
import { ProfileFavoriteAlbumsSection } from "@/components/profile-favorite-albums-section";
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import { ProfileDeferredBody } from "@/app/profile/[id]/profile-deferred-body";
import { ProfileHeroLoader } from "@/app/profile/[id]/profile-hero-loader";
import { ProfileBelowFoldSkeleton } from "@/app/profile/[id]/profile-below-fold-skeleton";
import { ProfileAvatarOptimisticProvider } from "@/components/profile/profile-avatar-context";
import { PrivateLogsToggle } from "@/components/profile/private-logs-toggle";

async function hasSpotifyToken(userId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("spotify_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const paramsResolved = await params;
  const segment =
    typeof paramsResolved?.id === "string" ? paramsResolved.id.trim() : "";
  if (!segment) notFound();

  const sessionPromise = getSession();
  const supabase = createSupabaseAdminClient();

  const userQueryPromise = (async () => {
    if (segment && isValidUuid(segment)) {
      return supabase
        .from("users")
        .select(
          "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed, logs_private",
        )
        .eq("id", segment)
        .maybeSingle();
    } else if (segment) {
      return supabase
        .from("users")
        .select(
          "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed, logs_private",
        )
        .eq("username", String(segment).trim())
        .maybeSingle();
    }
    return { data: null, error: null };
  })();

  const [session, userRes] = await Promise.all([
    sessionPromise,
    userQueryPromise,
  ]);

  const user = userRes.data as {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    lastfm_username: string | null;
    lastfm_last_synced_at: string | null;
    onboarding_completed: boolean;
    logs_private: boolean;
  } | null;
  const userError = userRes.error;

  if (userError) {
    console.error("ProfilePage user fetch error:", userError);
    notFound();
  }
  if (!user) {
    notFound();
  }

  if (!isValidUuid(segment)) {
    redirect(`/profile/${user.id}`);
  }

  const [favoriteAlbumsHero, spotifyConnected] = await Promise.all([
    getCachedUserFavoriteAlbums(user.id).catch((e) => {
      console.error("[profile] getCachedUserFavoriteAlbums (hero):", e);
      return [];
    }),
    session?.user?.id === user.id
      ? hasSpotifyToken(user.id)
      : Promise.resolve(false),
  ]);

  const profile = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    created_at: user.created_at,
    is_own_profile: !!session?.user?.id && session.user.id === user.id,
  };

  const isOwnProfile = !!profile.is_own_profile;

  const main = (
    <div className={sectionGap}>
      <div
        className={`relative overflow-hidden ${cardElevated} bg-gradient-to-br from-zinc-900/90 via-zinc-900/85 to-zinc-900/80 p-6 ring-1 ring-white/[0.06] sm:p-8`}
      >
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-emerald-500/[0.08] blur-3xl"
          aria-hidden
        />
        <div className="relative min-w-0">
          <Suspense
            fallback={
              <div className="h-32 w-full animate-pulse rounded-xl bg-zinc-800/50" />
            }
          >
            <ProfileHeroLoader
              userId={profile.id}
              username={profile.username}
              avatarUrl={profile.avatar_url}
              bio={profile.bio}
              session={session}
            />
          </Suspense>
          <ProfileFavoriteAlbumsSection
            userId={profile.id}
            favoriteAlbums={favoriteAlbumsHero}
            isOwnProfile={isOwnProfile}
            variant="hero"
            showHeading
            showEditButton={false}
          />
        </div>
      </div>

      <ProfileQuickActions
        profilePath={`/profile/${profile.id}`}
        isOwnProfile={isOwnProfile}
        userId={profile.id}
        username={profile.username}
        bio={profile.bio}
        avatarUrl={profile.avatar_url}
        viewerUserId={session?.user?.id ?? null}
      />

      {isOwnProfile ? (
        <PrivateLogsToggle initialPrivate={user.logs_private ?? false} />
      ) : null}

      <Suspense fallback={<ProfileBelowFoldSkeleton />}>
        <ProfileDeferredBody
          user={user}
          profile={profile}
          session={session}
          spotifyConnected={spotifyConnected}
          logsPrivate={user.logs_private ?? false}
        />
      </Suspense>
    </div>
  );

  return isOwnProfile ? (
    <ProfileAvatarOptimisticProvider>{main}</ProfileAvatarOptimisticProvider>
  ) : (
    main
  );
}
