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
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import type { TasteIdentity } from "@/lib/taste/types";
import { buildProfileHeroLines } from "@/lib/profile/hero-lines";
import { getTopThisWeek } from "@/lib/profile/top-this-week";
import { ProfileListeningReportPreview } from "@/components/profile/profile-listening-report-preview";
import { getListeningReportPreview } from "@/lib/profile/listening-report-preview";
import { getProfilePulseInsights } from "@/lib/profile/profile-pulse";
import { buildWeeklyNarrative } from "@/lib/profile/weekly-narrative";
import { ProfilePulseSection } from "@/components/profile/profile-pulse-section";
import { ProfileWeeklyTopAlbumsSection } from "@/components/profile/profile-weekly-top-albums";
import { cardElevated, sectionGap } from "@/lib/ui/surface";

const LISTS_PREVIEW_MAX = 6;

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
    getListeningReportPreview(user.id),
    getProfilePulseInsights(user.id),
    getTopThisWeek(user.id),
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

  const listeningReportPreview =
    profileSettled[8].status === "fulfilled"
      ? profileSettled[8].value
      : null;
  if (profileSettled[8].status === "rejected")
    console.error(
      "[profile] getListeningReportPreview failed:",
      profileSettled[8].reason,
    );

  const profilePulse =
    profileSettled[9].status === "fulfilled" ? profileSettled[9].value : null;
  if (profileSettled[9].status === "rejected")
    console.error(
      "[profile] getProfilePulseInsights failed:",
      profileSettled[9].reason,
    );

  const weeklyTop =
    profileSettled[10].status === "fulfilled"
      ? profileSettled[10].value
      : null;
  if (profileSettled[10].status === "rejected")
    console.error("[profile] getTopThisWeek failed:", profileSettled[10].reason);

  const weeklyNarrative = buildWeeklyNarrative({
    username: profile.username,
    isOwnProfile,
    taste: tasteIdentity,
    pulse: profilePulse,
    weeklyTop,
  });

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

      {!isOwnProfile ? (
        <div id="taste-match" className="scroll-mt-24">
          <TasteMatchSection
            profileUserId={profile.id}
            viewerUserId={session?.user?.id ?? null}
          />
        </div>
      ) : null}

      <div className="space-y-8 sm:space-y-10">
        {isOwnProfile ? (
          <section className="grid min-w-0 max-w-full gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0 max-w-full">
              <LastfmSection
                key={`lastfm-${profile.id}`}
                userId={profile.id}
                username={profile.username}
                initialUsername={user.lastfm_username ?? null}
                initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
              />
            </div>
            <div className="min-w-0 max-w-full">
              <SimilarUsersSection userId={profile.id} variant="strip" />
            </div>
          </section>
        ) : (
          <SimilarUsersSection userId={profile.id} variant="strip" />
        )}

        <SectionBlock
          title="Favorite albums"
          description={
            isOwnProfile
              ? "Albums you pin to your public profile."
              : "Albums they pin to their public profile."
          }
        >
          <ProfileFavoriteAlbumsSection
            userId={profile.id}
            favoriteAlbums={favoriteAlbums}
            isOwnProfile={isOwnProfile}
            showHeading={false}
          />
        </SectionBlock>

        {isOwnProfile && recommendedCommunities.length > 0 ? (
          <RecommendedCommunitiesSection
            title="Communities you'd like"
            items={recommendedCommunities}
          />
        ) : null}

        <div id="music-identity" className="scroll-mt-24">
          <SectionBlock
            title="Music identity"
            description={
              isOwnProfile
                ? "Genres, listening style, and top artists & albums — derived from your listening history."
                : "Genres, listening style, and top artists & albums — from their listening history."
            }
            action={{ label: "View all", href: "/reports/listening" }}
          >
            <TasteIdentitySection
              userId={profile.id}
              hubMode
              initialData={tasteIdentity}
              weeklyListening={isOwnProfile ? weeklyTop : null}
              weeklyListeningHideInIdentity={
                isOwnProfile &&
                !!weeklyTop &&
                (weeklyTop.artists.length > 0 || weeklyTop.albums.length > 0)
              }
            />
          </SectionBlock>
        </div>

        {weeklyNarrative ? (
          <div id="weekly-narrative" className="scroll-mt-24">
            <SectionBlock
              title="Weekly narrative"
              description={
                isOwnProfile
                  ? "Your listening identity, recent top artists, and pulse — rolling 7-day windows vs the prior 7 days (UTC)."
                  : "Their listening style, recent chart, and pulse — rolling 7-day windows (UTC)."
              }
              action={
                profilePulse
                  ? { label: "Pulse", href: "#profile-pulse" }
                  : { label: "Music identity", href: "#music-identity" }
              }
            >
              <div
                className={`${cardElevated} px-4 py-4 text-sm leading-relaxed text-zinc-300 sm:px-5 sm:py-5`}
              >
                {weeklyNarrative}
              </div>
            </SectionBlock>
          </div>
        ) : null}

        <ProfilePulseSection insights={profilePulse} />

        <div id="profile-activity" className="scroll-mt-24 space-y-8 sm:space-y-10">
          <SectionBlock
            title="Recent activity"
            description={
              isOwnProfile
                ? "A short preview of albums from your logs and recent Spotify plays."
                : "Latest albums from their listening history."
            }
            action={
              isOwnProfile
                ? { label: "View all activity", href: "/recently-played" }
                : undefined
            }
          >
            <ProfileRecentActivity
              userId={profile.id}
              isOwnProfile={isOwnProfile}
              showSpotifyControls={
                isOwnProfile && spotifyProfileControlsVisible
              }
              spotifyConnected={spotifyConnected}
            />
          </SectionBlock>

          <ProfileWeeklyTopAlbumsSection
            weeklyTop={weeklyTop}
            isOwnProfile={isOwnProfile}
          />
        </div>

        <div id="profile-lists" className="scroll-mt-24">
          <SectionBlock
            title={isOwnProfile ? "Your lists" : "Lists"}
            description={
              isOwnProfile
                ? "Collections of albums and tracks — tap a card to open or create a new list."
                : "Curated albums and tracks they share."
            }
            action={
              isOwnProfile && userLists.length > 0
                ? {
                    label:
                      userLists.length > LISTS_PREVIEW_MAX
                        ? `View all (${userLists.length})`
                        : "View all lists",
                    href: "/lists",
                  }
                : undefined
            }
            headerRight={isOwnProfile ? <ProfileListsSection /> : undefined}
          >
            <div id="lists">
              {userLists.length === 0 ? (
                <div
                  className={`${cardElevated} px-4 py-8 text-center sm:px-6 sm:py-10`}
                >
                  <p className="text-zinc-500">
                    {isOwnProfile
                      ? "You haven't created any lists yet."
                      : "No lists yet."}
                  </p>
                  {isOwnProfile && (
                    <div className="mt-4 flex justify-center">
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
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                    {(isOwnProfile
                      ? userLists.slice(0, LISTS_PREVIEW_MAX)
                      : userLists
                    ).map((list) => (
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
                          profilePreview
                        />
                      </li>
                    ))}
                  </ul>
                  {isOwnProfile && userLists.length > LISTS_PREVIEW_MAX ? (
                    <p className="mt-4 text-sm text-zinc-500">
                      Showing {LISTS_PREVIEW_MAX} of {userLists.length} lists.{" "}
                      <Link
                        href="/lists"
                        className="font-medium text-emerald-400 hover:underline"
                      >
                        Manage all lists
                      </Link>
                    </p>
                  ) : null}
                  {isOwnProfile && userLists.length > 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">
                      <Link
                        href="/search/users"
                        className="text-emerald-400 hover:underline"
                      >
                        Find people
                      </Link>
                      {" to discover more lists."}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </SectionBlock>
        </div>

        <div id="profile-reports" className="scroll-mt-24 space-y-8 sm:space-y-10">
          <SectionBlock
            title="Listening report"
            description="Weekly snapshot: top artist and genre from your history (UTC)."
            action={{ label: "View full report", href: "/reports/listening" }}
          >
            <ProfileListeningReportPreview data={listeningReportPreview} />
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
        </div>

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
      </div>

      {isOwnProfile ? (
        <DeleteAccountSection username={profile.username} />
      ) : null}
    </div>
  );
}
