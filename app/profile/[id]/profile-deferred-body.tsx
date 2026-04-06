import Link from "next/link";
import type { Session } from "next-auth";
import { SectionBlock } from "@/components/layout/section-block";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileFavoriteAlbumsSection } from "@/components/profile-favorite-albums-section";
import { ProfileRecentActivity } from "@/components/profile/profile-recent-activity";
import { LastfmSection } from "@/components/lastfm/lastfm-section";
import { TasteIdentitySection } from "@/components/profile/taste-identity-section";
import { ListeningInsightsSection } from "@/components/profile/listening-insights-section";
import { isSpotifyProfileIntegrationVisible } from "@/lib/spotify-integration-enabled";
import { ListCard } from "@/components/list-card";
import { ProfileListsSection } from "@/app/profile/[id]/profile-lists-section";
import { SimilarUsersSection } from "@/components/similar-users-section";
import { RecommendedCommunitiesSuspense } from "@/components/discover/recommended-communities-suspense";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { DeleteAccountSection } from "@/components/profile/delete-account-section";
import type { TasteIdentity } from "@/lib/taste/types";
import { buildWeeklyNarrative } from "@/lib/profile/weekly-narrative";
import { ProfileListeningReportPreview } from "@/components/profile/profile-listening-report-preview";
import { ProfilePulseSection } from "@/components/profile/profile-pulse-section";
import { ProfileWeeklyTopAlbumsSection } from "@/components/profile/profile-weekly-top-albums";
import {
  layoutMainColumn,
  layoutMainSidebarGrid,
  layoutSidebarColumn,
} from "@/lib/ui/layout";
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import {
  getCachedListeningInsights,
  getCachedListeningReportPreview,
  getCachedProfilePulseInsights,
  getCachedTasteIdentity,
  getCachedTopThisWeek,
  getCachedUserAchievements,
  getCachedUserFavoriteAlbums,
  getCachedUserListsWithPreviews,
  getCachedUserMatches,
} from "@/lib/profile/cached-profile-data";

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

type ProfileDeferredBodyProps = {
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    lastfm_username: string | null;
    lastfm_last_synced_at: string | null;
  };
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    followers_count: number;
    following_count: number;
    is_following: boolean;
    is_own_profile: boolean;
  };
  session: Session | null;
  spotifyConnected: boolean;
};

export async function ProfileDeferredBody({
  user,
  profile,
  session,
  spotifyConnected,
}: ProfileDeferredBodyProps) {
  const isOwnProfile = !!profile.is_own_profile;
  const spotifyProfileControlsVisible = isSpotifyProfileIntegrationVisible();

  const settled = await Promise.allSettled([
    getCachedUserListsWithPreviews(user.id, 50, 0),
    getCachedUserAchievements(user.id),
    getCachedUserFavoriteAlbums(user.id),
    getCachedTasteIdentity(user.id),
    getCachedListeningReportPreview(user.id),
    getCachedProfilePulseInsights(user.id),
    getCachedTopThisWeek(user.id),
    getCachedUserMatches(user.id),
    session?.user?.id ? getCachedListeningInsights(user.id) : Promise.resolve(null),
  ]);

  const userLists =
    settled[0].status === "fulfilled" ? settled[0].value : [];
  if (settled[0].status === "rejected")
    console.error(
      "[profile] getCachedUserListsWithPreviews failed:",
      settled[0].reason,
    );
  const achievements =
    settled[1].status === "fulfilled" ? settled[1].value : [];
  if (settled[1].status === "rejected")
    console.error(
      "[profile] getCachedUserAchievements failed:",
      settled[1].reason,
    );
  const favoriteAlbums =
    settled[2].status === "fulfilled" ? settled[2].value : [];
  if (settled[2].status === "rejected")
    console.error(
      "[profile] getCachedUserFavoriteAlbums failed:",
      settled[2].reason,
    );
  const tasteIdentity: TasteIdentity =
    settled[3].status === "fulfilled" ? settled[3].value : EMPTY_TASTE;
  if (settled[3].status === "rejected")
    console.error(
      "[profile] getCachedTasteIdentity failed:",
      settled[3].reason,
    );
  const listeningReportPreview =
    settled[4].status === "fulfilled" ? settled[4].value : null;
  if (settled[4].status === "rejected")
    console.error(
      "[profile] getCachedListeningReportPreview failed:",
      settled[4].reason,
    );
  const profilePulse =
    settled[5].status === "fulfilled" ? settled[5].value : null;
  if (settled[5].status === "rejected")
    console.error(
      "[profile] getCachedProfilePulseInsights failed:",
      settled[5].reason,
    );
  const weeklyTop =
    settled[6].status === "fulfilled" ? settled[6].value : null;
  if (settled[6].status === "rejected")
    console.error(
      "[profile] getCachedTopThisWeek failed:",
      settled[6].reason,
    );
  const userMatchesPrefetched =
    settled[7].status === "fulfilled" ? settled[7].value : undefined;
  if (settled[7].status === "rejected")
    console.error(
      "[profile] getCachedUserMatches failed:",
      settled[7].reason,
    );
  const listeningInsightsPrefetched =
    settled[8].status === "fulfilled" ? settled[8].value : undefined;
  if (settled[8].status === "rejected")
    console.error(
      "[profile] getCachedListeningInsights failed:",
      settled[8].reason,
    );

  const weeklyNarrative = buildWeeklyNarrative({
    username: profile.username,
    isOwnProfile,
    taste: tasteIdentity,
    pulse: profilePulse,
    weeklyTop,
  });

  return (
    <div className={sectionGap}>
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
          <section className={`${layoutMainSidebarGrid} min-w-0 max-w-full`}>
            <div className={layoutMainColumn}>
              <LastfmSection
                key={`lastfm-${profile.id}`}
                userId={profile.id}
                username={profile.username}
                initialUsername={user.lastfm_username ?? null}
                initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
              />
            </div>
            <div className={layoutSidebarColumn}>
              <SimilarUsersSection
                userId={profile.id}
                variant="strip"
                prefetchedMatches={userMatchesPrefetched}
              />
            </div>
          </section>
        ) : (
          <SimilarUsersSection
            userId={profile.id}
            variant="strip"
            prefetchedMatches={userMatchesPrefetched}
          />
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

        {isSocialInboxAndMusicRecUiEnabled() && isOwnProfile ? (
          <RecommendedCommunitiesSuspense
            userId={user.id}
            title="Communities you'd like"
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
                  ? "Your listening identity, recent top artists, and pulse — trends compare the last seven days to the week before; new discoveries are artists you’re hearing for the first time."
                  : "Their listening style, recent chart, and pulse — trends use the last seven days vs the week before; new discoveries are first-time listens in their chart."
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
            description="Weekly snapshot: top artist and genre from your listening history."
            action={{ label: "View full report", href: "/reports/listening" }}
          >
            <ProfileListeningReportPreview data={listeningReportPreview} />
          </SectionBlock>

          {session?.user?.id ? (
            <SectionBlock
              title="Listening habits"
              description="Patterns from your recent listening."
              action={{ label: "View all", href: "/reports/listening" }}
            >
              <ListeningInsightsSection
                userId={profile.id}
                maxLines={3}
                embedded
                prefetched={listeningInsightsPrefetched ?? undefined}
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
