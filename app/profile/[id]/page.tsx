import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { ProfileHeader } from "@/components/profile-header";
import { ProfileQuickActions } from "@/components/profile/profile-quick-actions";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getFollowCounts,
  isFollowing,
  getUserStreak,
} from "@/lib/queries";
import { isValidUuid } from "@/lib/validation";
import type { TasteIdentity } from "@/lib/taste/types";
import {
  getCachedTasteIdentity,
  getCachedUserFavoriteAlbums,
} from "@/lib/profile/cached-profile-data";
import { sectionGap } from "@/lib/ui/surface";
import { ProfileDeferredBody } from "@/app/profile/[id]/profile-deferred-body";
import { ProfileBelowFoldSkeleton } from "@/app/profile/[id]/profile-below-fold-skeleton";
import { ProfileAvatarOptimisticProvider } from "@/components/profile/profile-avatar-context";
import { ProfileHeroBanner } from "@/components/profile/profile-hero-banner";

const EMPTY_TASTE: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "plotting-the-plot",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "",
};

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

  const [profileSettled, tasteForHero, favoriteAlbumsHero] = await Promise.all([
    Promise.allSettled([
      getFollowCounts(user.id),
      session?.user?.id && session.user.id !== user.id
        ? isFollowing(session.user.id, user.id)
        : Promise.resolve(false),
      session?.user?.id === user.id
        ? hasSpotifyToken(user.id)
        : Promise.resolve(false),
      getUserStreak(user.id),
    ]),
    getCachedTasteIdentity(user.id),
    getCachedUserFavoriteAlbums(user.id).catch((e) => {
      console.error("[profile] getCachedUserFavoriteAlbums (hero):", e);
      return [];
    }),
  ]);

  const counts =
    profileSettled[0].status === "fulfilled"
      ? profileSettled[0].value
      : { followers_count: 0, following_count: 0 };
  if (profileSettled[0].status === "rejected")
    console.error(
      "[profile] getFollowCounts failed:",
      profileSettled[0].reason,
    );
  const isFollowingUser =
    profileSettled[1].status === "fulfilled" ? profileSettled[1].value : false;
  if (profileSettled[1].status === "rejected")
    console.error("[profile] isFollowing failed:", profileSettled[1].reason);

  const profile = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    created_at: user.created_at,
    followers_count: counts.followers_count,
    following_count: counts.following_count,
    is_following: isFollowingUser,
    is_own_profile: !!session?.user?.id && session.user.id === user.id,
  };

  const isOwnProfile = !!profile.is_own_profile;

  const spotifyConnected =
    profileSettled[2].status === "fulfilled" ? profileSettled[2].value : false;
  if (profileSettled[2].status === "rejected")
    console.error(
      "[profile] hasSpotifyToken failed:",
      profileSettled[2].reason,
    );
  const streak =
    profileSettled[3].status === "fulfilled" ? profileSettled[3].value : null;
  if (profileSettled[3].status === "rejected")
    console.error("[profile] getUserStreak failed:", profileSettled[3].reason);

  const heroTaste: TasteIdentity = tasteForHero ?? EMPTY_TASTE;
  const totalListens = heroTaste.totalLogs ?? 0;

  const main = (
    <div className={sectionGap}>
      <ProfileHeroBanner
        albums={favoriteAlbumsHero}
      >
        <ProfileHeader
          variant="banner"
          username={profile.username}
          avatarUrl={profile.avatar_url}
          bio={profile.bio}
          followersCount={profile.followers_count ?? 0}
          followingCount={profile.following_count ?? 0}
          isOwnProfile={isOwnProfile}
          isFollowing={profile.is_following ?? false}
          userId={profile.id}
          viewerUserId={session?.user?.id ?? null}
        />

        {/* Stats row */}
        {(totalListens > 0 || (streak?.current_streak ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {totalListens > 0 && (
              <span>
                <span className="font-semibold text-white">
                  {totalListens.toLocaleString()}
                </span>{" "}
                <span className="text-zinc-400">listens</span>
              </span>
            )}
            {(streak?.current_streak ?? 0) > 0 && (
              <span>
                <span className="font-semibold text-white">
                  🔥 {streak!.current_streak}d
                </span>{" "}
                <span className="text-zinc-400">streak</span>
              </span>
            )}
          </div>
        )}
      </ProfileHeroBanner>

      {/* Quick actions row */}
      <ProfileQuickActions
        profilePath={`/profile/${profile.id}`}
        isOwnProfile={isOwnProfile}
        userId={profile.id}
        username={profile.username}
        bio={profile.bio}
        avatarUrl={profile.avatar_url}
        viewerUserId={session?.user?.id ?? null}
      />

      {/* Tabs — all content pre-rendered, switching is instant */}
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
