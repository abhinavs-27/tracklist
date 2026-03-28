import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SectionBlock } from "@/components/layout/section-block";
import { ProfileHeader } from "@/components/profile-header";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileFavoriteAlbumsSection } from "@/components/profile-favorite-albums-section";
import { ProfileQuickActions } from "@/components/profile/profile-quick-actions";
import { ProfileRecentActivity } from "@/components/profile/profile-recent-activity";
import { LastfmSection } from "@/components/lastfm/lastfm-section";
import { TasteIdentitySection } from "@/components/profile/taste-identity-section";
import { ListeningInsightsSection } from "@/components/profile/listening-insights-section";
import { isSpotifyProfileIntegrationVisible } from "@/lib/spotify-integration-enabled";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getFollowCounts,
  isFollowing,
  getUserListsWithPreviews,
  getUserStreak,
  getUserAchievements,
  getUserFavoriteAlbums,
} from "@/lib/queries";
import { ListCard } from "@/components/list-card";
import { ProfileListsSection } from "@/app/profile/[id]/profile-lists-section";
import { SimilarUsersSection } from "@/components/similar-users-section";
import { isValidUuid } from "@/lib/validation";
import { getRecommendedCommunities } from "@/lib/community/getRecommendedCommunities";
import { RecommendedCommunitiesSection } from "@/components/discover/recommended-communities-section";
import { DeleteAccountSection } from "@/components/profile/delete-account-section";
import { SignOutSection } from "@/components/profile/sign-out-section";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import type { TasteIdentity } from "@/lib/taste/types";
import { buildProfileHeroLines } from "@/lib/profile/hero-lines";
import { ProfileTopThisWeekSection } from "@/components/profile/profile-top-this-week";
import { cardElevated, sectionGap } from "@/lib/ui/surface";

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

  const session = await getServerSession(authOptions);

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

  const spotifyProfileControlsVisible = isSpotifyProfileIntegrationVisible();

  if (!isValidUuid(segment)) {
    redirect(`/profile/${user.id}`);
  }

  const profileSettled = await Promise.allSettled([
    getFollowCounts(user.id),
    session?.user?.id && session.user.id !== user.id
      ? isFollowing(session.user.id, user.id)
      : Promise.resolve(false),
    session?.user?.id === user.id
      ? hasSpotifyToken(user.id)
      : Promise.resolve(false),
    getUserListsWithPreviews(user.id, 50, 0),
    getUserStreak(user.id),
    getUserAchievements(user.id),
    getUserFavoriteAlbums(user.id),
    getTasteIdentity(user.id),
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
  const userLists =
    profileSettled[3].status === "fulfilled" ? profileSettled[3].value : [];
  if (profileSettled[3].status === "rejected")
    console.error(
      "[profile] getUserListsWithPreviews failed:",
      profileSettled[3].reason,
    );
  const streak =
    profileSettled[4].status === "fulfilled" ? profileSettled[4].value : null;
  if (profileSettled[4].status === "rejected")
    console.error("[profile] getUserStreak failed:", profileSettled[4].reason);
  const achievements =
    profileSettled[5].status === "fulfilled" ? profileSettled[5].value : [];
  if (profileSettled[5].status === "rejected")
    console.error(
      "[profile] getUserAchievements failed:",
      profileSettled[5].reason,
    );
  const favoriteAlbums =
    profileSettled[6].status === "fulfilled" ? profileSettled[6].value : [];
  if (profileSettled[6].status === "rejected")
    console.error(
      "[profile] getUserFavoriteAlbums failed:",
      profileSettled[6].reason,
    );

  const tasteIdentity: TasteIdentity =
    profileSettled[7].status === "fulfilled"
      ? profileSettled[7].value
      : EMPTY_TASTE;
  if (profileSettled[7].status === "rejected")
    console.error(
      "[profile] getTasteIdentity failed:",
      profileSettled[7].reason,
    );

  const heroLines = buildProfileHeroLines(tasteIdentity, streak);

  let recommendedCommunities: Awaited<
    ReturnType<typeof getRecommendedCommunities>
  > = [];
  if (session?.user?.id === user.id) {
    try {
      recommendedCommunities = await getRecommendedCommunities(user.id);
    } catch (e) {
      console.error("[profile] getRecommendedCommunities failed:", e);
    }
  }

  return (
    <div className={sectionGap}>
      <div
        className={`relative overflow-hidden ${cardElevated} bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-emerald-950/35 p-5 ring-1 ring-white/[0.08] sm:p-7`}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-emerald-500/[0.14] blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 text-center sm:text-left">
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
              vibeLine={heroLines.vibeLine}
            />
          </div>
        </div>
      </div>

      <ProfileQuickActions
        profilePath={`/profile/${profile.id}`}
        isOwnProfile={isOwnProfile}
        userId={profile.id}
        username={profile.username}
        bio={profile.bio}
        avatarUrl={profile.avatar_url}
      />

      {isOwnProfile ? (
        <section className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <LastfmSection
            key={`lastfm-${profile.id}`}
            userId={profile.id}
            username={profile.username}
            initialUsername={user.lastfm_username ?? null}
            initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
          />
          <SimilarUsersSection userId={profile.id} variant="strip" />
        </section>
      ) : null}

      {isOwnProfile && recommendedCommunities.length > 0 ? (
        <RecommendedCommunitiesSection
          title="Communities you'd like"
          items={recommendedCommunities}
        />
      ) : null}

      <SectionBlock
        title="Favorite albums"
        description="Albums you pin to your public profile."
      >
        <ProfileFavoriteAlbumsSection
          userId={profile.id}
          favoriteAlbums={favoriteAlbums}
          isOwnProfile={isOwnProfile}
          showHeading={false}
        />
      </SectionBlock>

      {isOwnProfile ? (
        <ProfileTopThisWeekSection userId={profile.id} />
      ) : null}

      {!isOwnProfile && (
        <TasteMatchSection
          profileUserId={profile.id}
          viewerUserId={session?.user?.id ?? null}
        />
      )}

      <SectionBlock
        title="Taste identity"
        description="Top artists, genres, and how your listening comes together."
        action={{ label: "View all", href: "/reports/listening" }}
      >
        <TasteIdentitySection
          userId={profile.id}
          hubMode
          initialData={tasteIdentity}
        />
      </SectionBlock>

      {session?.user?.id ? (
        <SectionBlock
          title="Listening habits"
          description="Behavioral highlights from your recent logs."
          action={{ label: "View all", href: "/reports/listening" }}
        >
          <ListeningInsightsSection
            userId={profile.id}
            maxLines={3}
            embedded
          />
        </SectionBlock>
      ) : null}

      <SectionBlock
        title="Recent activity"
        description={
          isOwnProfile
            ? "Latest albums from your logs and recent Spotify plays when connected."
            : "Latest albums from their listening history."
        }
      >
        <ProfileRecentActivity
          userId={profile.id}
          isOwnProfile={isOwnProfile}
          showSpotifyControls={isOwnProfile && spotifyProfileControlsVisible}
          spotifyConnected={spotifyConnected}
        />
      </SectionBlock>

      {achievements.length > 0 ? (
        <SectionBlock
          title="Achievements"
          description="Milestones from your time on Tracklist."
        >
          <div className="flex flex-wrap gap-3">
            {achievements.map(({ achievement, earned_at }) => (
              <div
                key={achievement.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                title={achievement.description ?? achievement.name}
              >
                <span className="text-xl">{achievement.icon ?? "🏅"}</span>
                <div>
                  <p className="font-medium text-white">{achievement.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      <SectionBlock
        title={isOwnProfile ? "Your lists" : "Lists"}
        description="Curated albums and tracks you share."
        action={
          isOwnProfile && userLists.length > 0
            ? { label: "View all", href: "/lists" }
            : undefined
        }
        headerRight={isOwnProfile ? <ProfileListsSection /> : undefined}
      >
        <div id="lists">
          {userLists.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-zinc-500">
                {isOwnProfile
                  ? "You haven't created any lists yet."
                  : "No lists yet."}
              </p>
              {isOwnProfile && (
                <div className="mt-3 flex justify-center">
                  <ProfileListsSection triggerLabel="Create your first list" />
                </div>
              )}
              {!isOwnProfile && (
                <Link
                  href="/search/users"
                  className="mt-2 inline-block text-sm text-emerald-400 hover:underline"
                >
                  Find people to discover their lists
                </Link>
              )}
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {userLists.map((list) => (
                  <li key={list.id}>
                    <ListCard
                      id={list.id}
                      title={list.title}
                      description={list.description}
                      created_at={list.created_at}
                      item_count={list.item_count}
                      visibility={list.visibility}
                      emoji={list.emoji}
                      image_url={list.image_url}
                      preview_labels={list.preview_labels}
                    />
                  </li>
                ))}
              </ul>
              {isOwnProfile && (
                <p className="mt-4 text-sm text-zinc-500">
                  <Link
                    href="/search/users"
                    className="text-emerald-400 hover:underline"
                  >
                    Find people
                  </Link>
                  {" to discover more lists."}
                </p>
              )}
            </>
          )}
        </div>
      </SectionBlock>

      {isOwnProfile ? (
        <div className="space-y-6">
          <SignOutSection />
          <DeleteAccountSection username={profile.username} />
        </div>
      ) : null}
    </div>
  );
}
