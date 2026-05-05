import Link from "next/link";
import type { Session } from "next-auth";
import { SectionBlock } from "@/components/layout/section-block";
import { TasteMatchSection } from "@/components/taste-match";
import { ProfileRecentActivity } from "@/components/profile/profile-recent-activity";
import { LastfmSection } from "@/components/lastfm/lastfm-section";
import { TasteIdentitySection } from "@/components/profile/taste-identity-section";
import { ProfileInsightCards } from "@/components/profile/profile-insight-cards";
import { TasteTimeline } from "@/components/profile/taste-timeline";
import { getTasteTimeline } from "@/lib/profile/taste-timeline";
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
import { cardElevated, sectionGap } from "@/lib/ui/surface";
import { ProfileTabsContainer } from "@/components/profile/profile-tabs";
import { LastfmConnectPrompt } from "@/components/lastfm/lastfm-connect-prompt";
import { getTasteInsights } from "@/lib/profile/taste-insights";
import {
  getCachedListeningReportPreview,
  getCachedProfilePulseInsights,
  getCachedTasteIdentity,
  getCachedTopThisWeek,
  getCachedUserAchievements,
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
  /** Profile subject — when true, other viewers don’t see log-derived activity. */
  logsPrivate: boolean;
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
  logsPrivate,
}: ProfileDeferredBodyProps) {
  const isOwnProfile = !!profile.is_own_profile;
  const spotifyProfileControlsVisible = isSpotifyProfileIntegrationVisible();

  const settled = await Promise.allSettled([
    getCachedUserListsWithPreviews(user.id, 50, 0),
    getCachedUserAchievements(user.id),
    getCachedTasteIdentity(user.id),
    getCachedListeningReportPreview(user.id),
    getCachedProfilePulseInsights(user.id),
    getCachedTopThisWeek(user.id),
    getCachedUserMatches(user.id),
    getTasteInsights(user.id),
    getTasteTimeline(user.id),
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
  const tasteIdentity: TasteIdentity =
    settled[2].status === "fulfilled" ? settled[2].value : EMPTY_TASTE;
  if (settled[2].status === "rejected")
    console.error(
      "[profile] getCachedTasteIdentity failed:",
      settled[2].reason,
    );
  const listeningReportPreview =
    settled[3].status === "fulfilled" ? settled[3].value : null;
  if (settled[3].status === "rejected")
    console.error(
      "[profile] getCachedListeningReportPreview failed:",
      settled[3].reason,
    );
  const profilePulse =
    settled[4].status === "fulfilled" ? settled[4].value : null;
  if (settled[4].status === "rejected")
    console.error(
      "[profile] getCachedProfilePulseInsights failed:",
      settled[4].reason,
    );
  const weeklyTop =
    settled[5].status === "fulfilled" ? settled[5].value : null;
  if (settled[5].status === "rejected")
    console.error(
      "[profile] getCachedTopThisWeek failed:",
      settled[5].reason,
    );
  const userMatchesPrefetched =
    settled[6].status === "fulfilled" ? settled[6].value : undefined;
  if (settled[6].status === "rejected")
    console.error(
      "[profile] getCachedUserMatches failed:",
      settled[6].reason,
    );
  const tasteInsights =
    settled[7].status === "fulfilled"
      ? settled[7].value
      : { arc: { kind: "insufficient" as const, narrative: "", risingArtists: [], stableArtists: [] }, discovery: { kind: "insufficient" as const, narrative: "", newArtistsCount: 0, revisitRate: 0, recentFinds: [] } };
  if (settled[7].status === "rejected")
    console.error("[profile] getTasteInsights failed:", settled[7].reason);

  const tasteTimeline =
    settled[8].status === "fulfilled"
      ? settled[8].value
      : { months: [], shifts: [], hasData: false };
  if (settled[8].status === "rejected")
    console.error("[profile] getTasteTimeline failed:", settled[8].reason);

  const weeklyNarrative = buildWeeklyNarrative({
    username: profile.username,
    isOwnProfile,
    taste: tasteIdentity,
    pulse: profilePulse,
    weeklyTop,
  });

  const hasLastfm = Boolean(user.lastfm_username?.trim());

  // ── Listening tab ──────────────────────────────────────────────────────────
  const listeningTab = (
    <div className={sectionGap}>
      {isOwnProfile && !hasLastfm && (
        <LastfmConnectPrompt
          userId={profile.id}
          heading="No listening history yet"
          body="Connect Last.fm to automatically log every Spotify play. Your charts, recent activity, and taste profile will all fill in from here."
        />
      )}

      <SectionBlock
        title="Recent activity"
        action={
          isOwnProfile
            ? { label: "View all", href: "/recently-played" }
            : undefined
        }
      >
        <ProfileRecentActivity
          key={profile.id}
          userId={profile.id}
          isOwnProfile={isOwnProfile}
          showSpotifyControls={isOwnProfile && spotifyProfileControlsVisible}
          spotifyConnected={spotifyConnected}
          logsPrivateHidden={!isOwnProfile && logsPrivate}
        />
      </SectionBlock>

      <ProfileWeeklyTopAlbumsSection
        weeklyTop={weeklyTop}
        isOwnProfile={isOwnProfile}
      />

      <ProfilePulseSection insights={profilePulse} />

      {weeklyNarrative ? (
        <SectionBlock title="Weekly narrative">
          <div className={`${cardElevated} px-4 py-4 text-sm leading-relaxed text-zinc-300 sm:px-5 sm:py-5`}>
            {weeklyNarrative}
          </div>
        </SectionBlock>
      ) : null}

      {isOwnProfile ? (
        <SimilarUsersSection
          userId={profile.id}
          variant="strip"
          prefetchedMatches={userMatchesPrefetched}
        />
      ) : null}
    </div>
  );

  // ── Taste tab ───────────────────────────────────────────────────────────────
  const tasteTab = (
    <div className={sectionGap}>
      {/* TasteMatch — only shown when viewing someone else’s profile */}
      {!isOwnProfile ? (
        <div id="taste-match" className="scroll-mt-24">
          <TasteMatchSection
            profileUserId={profile.id}
            viewerUserId={session?.user?.id ?? null}
          />
        </div>
      ) : null}

      {/* For other profiles: similar users */}
      {!isOwnProfile ? (
        <SimilarUsersSection
          userId={profile.id}
          variant="strip"
          prefetchedMatches={userMatchesPrefetched}
        />
      ) : null}

      {isSocialInboxAndMusicRecUiEnabled() && isOwnProfile ? (
        <RecommendedCommunitiesSuspense
          userId={user.id}
          title="Communities you’d like"
        />
      ) : null}

      <div id="music-identity" className="scroll-mt-24">
        <SectionBlock
          title="Music identity"
          action={{ label: "Full report →", href: "/reports/listening" }}
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

      <SectionBlock title="Listening insights">
        <ProfileInsightCards
          arc={tasteInsights.arc}
          discovery={tasteInsights.discovery}
          taste={tasteIdentity}
        />
      </SectionBlock>

      {tasteTimeline.hasData && (
        <SectionBlock title="Taste over time">
          <TasteTimeline data={tasteTimeline} />
        </SectionBlock>
      )}

      <SectionBlock
        title="Listening report"
        action={{ label: "Full report →", href: "/reports/listening" }}
      >
        <ProfileListeningReportPreview data={listeningReportPreview} />
      </SectionBlock>

      {achievements.length > 0 ? (
        <SectionBlock title="Achievements">
          <div className="flex flex-wrap gap-3">
            {achievements.map(({ achievement, earned_at }) => (
              <div
                key={achievement.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5"
                title={achievement.description ?? achievement.name}
              >
                <span className="text-xl">{achievement.icon ?? "🏅"}</span>
                <div>
                  <p className="text-sm font-medium text-white">{achievement.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {/* Last.fm integration — own profile only, always preserved here */}
      {isOwnProfile ? (
        <LastfmSection
          key={`lastfm-${profile.id}`}
          userId={profile.id}
          username={profile.username}
          initialUsername={user.lastfm_username ?? null}
          initialLastSyncedAt={user.lastfm_last_synced_at ?? null}
        />
      ) : null}

      {isOwnProfile ? (
        <DeleteAccountSection username={profile.username} />
      ) : null}
    </div>
  );

  // ── Lists tab ───────────────────────────────────────────────────────────────
  const listsTab = (
    <div className={sectionGap}>
      <SectionBlock
        title={isOwnProfile ? "Your lists" : "Lists"}
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
        {userLists.length === 0 ? (
          <div className={`${cardElevated} px-4 py-8 text-center sm:px-6 sm:py-10`}>
            <p className="text-zinc-500">
              {isOwnProfile ? "No lists yet." : "No lists yet."}
            </p>
            {isOwnProfile && (
              <div className="mt-4 flex justify-center">
                <ProfileListsSection triggerLabel="Create your first list" />
              </div>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {(isOwnProfile ? userLists.slice(0, LISTS_PREVIEW_MAX) : userLists).map(
              (list) => (
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
              ),
            )}
          </ul>
        )}
      </SectionBlock>
    </div>
  );

  return (
    <ProfileTabsContainer
      listeningContent={listeningTab}
      tasteContent={tasteTab}
      listsContent={listsTab}
    />
  );
}
