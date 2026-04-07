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
import { buildProfileHeroLines } from "@/lib/profile/hero-lines";
import {
  getCachedTasteIdentity,
  getCachedUserFavoriteAlbums,
} from "@/lib/profile/cached-profile-data";
import { ProfileFavoriteAlbumsSection } from "@/components/profile-favorite-albums-section";
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import { ProfileDeferredBody } from "@/app/profile/[id]/profile-deferred-body";
import { ProfileBelowFoldSkeleton } from "@/app/profile/[id]/profile-below-fold-skeleton";
import { ProfileAvatarOptimisticProvider } from "@/components/profile/profile-avatar-context";

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

  const session = await getSession();

  const supabase = createSupabaseAdminClient();
  let user: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    lastfm_username: string | null;
    lastfm_last_synced_at: string | null;
    onboarding_completed: boolean;
  } | null = null;
  let userError: unknown = null;

  if (segment && isValidUuid(segment)) {
    const result = await supabase
      .from("users")
      .select(
        "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed",
      )
      .eq("id", segment)
      .maybeSingle();
    user = result.data;
    userError = result.error;
  } else if (segment) {
    const result = await supabase
      .from("users")
      .select(
        "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed",
      )
      .eq("username", String(segment).trim())
      .maybeSingle();
    user = result.data;
    userError = result.error;
  }

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
  const heroLines = buildProfileHeroLines(heroTaste, streak);

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
          <ProfileHeader
            variant="hero"
            username={profile.username}
            avatarUrl={profile.avatar_url}
            bio={profile.bio}
            followersCount={profile.followers_count ?? 0}
            followingCount={profile.following_count ?? 0}
            isOwnProfile={isOwnProfile}
            isFollowing={profile.is_following ?? false}
            userId={profile.id}
            viewerUserId={session?.user?.id ?? null}
            keyStatLine={heroLines.keyStatLine}
          />
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

      <Suspense fallback={<ProfileBelowFoldSkeleton />}>
        <ProfileDeferredBody
          user={user}
          profile={profile}
          session={session}
          spotifyConnected={spotifyConnected}
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
