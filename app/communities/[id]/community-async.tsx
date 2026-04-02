import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { CommunityWeeklySummary } from "@/components/community/community-weekly-summary";
import { CommunityLeaderboardSection } from "@/components/community/community-leaderboard-section";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityMembersSectionClient } from "@/components/community/community-members-section-client";
import { CommunityMobileWebShell } from "@/components/community/community-mobile-web-shell";
import { CommunityWeeklyBillboardClient } from "@/components/community/community-weekly-billboard-client";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import {
  getCachedCommunityBillboardTracksInitial,
  getCachedCommunityFeedPreload,
  getCachedCommunityInsights,
  getCachedCommunityInviteUrl,
  getCachedCommunityMatch,
  getCachedCommunityMemberStatsForLeaderboard,
  getCachedCommunityMembersRosterPage1,
  getCachedCommunityWeeklySummaryWithTrend,
  getCachedWeeklyLeaderboard,
  loadCommunityMemberPageData,
  type CommunityFeedPreload,
  type CommunityWeeklySummaryBundle,
} from "@/lib/community/community-page-cache";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import { communityBody } from "@/lib/ui/surface";

export type { CommunityFeedPreload };

export async function getCommunityFeedPreload(
  communityId: string,
): Promise<CommunityFeedPreload> {
  return getCachedCommunityFeedPreload(communityId);
}

export function CommunityTasteMatchSlot({ score }: { score: number }) {
  return <CommunityTasteMatchCard score={score} />;
}

export async function CommunityTasteMatchAsyncSlot({
  userId,
  communityId,
}: {
  userId: string;
  communityId: string;
}) {
  const { score } = await getCachedCommunityMatch(userId, communityId);
  return <CommunityTasteMatchSlot score={score} />;
}

export async function CommunityPulseAsyncSlot({
  communityId,
}: {
  communityId: string;
}) {
  const tz = (await headers()).get("x-vercel-ip-timezone") ?? undefined;
  const [insights, weekly] = await Promise.all([
    getCachedCommunityInsights(communityId),
    getCachedCommunityWeeklySummaryWithTrend(communityId, tz),
  ]);
  return (
    <CommunityPulseSlot
      communityId={communityId}
      insights={insights}
      weeklySummaryPayload={weekly}
    />
  );
}

export async function CommunityInviteMembersAsyncSlot({
  communityId,
  userId,
}: {
  communityId: string;
  userId: string;
}) {
  const inviteUrl = await getCachedCommunityInviteUrl(communityId, userId);
  return (
    <InviteMembersPanel communityId={communityId} initialInviteUrl={inviteUrl} />
  );
}

export async function CommunityBillboardStreamSlot({
  communityId,
  communityName,
}: {
  communityId: string;
  communityName: string;
}) {
  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id;
  if (!viewerId) return null;
  const billboard = await getCachedCommunityBillboardTracksInitial(
    communityId,
    viewerId,
  );
  return (
    <CommunityWeeklyBillboardClient
      communityId={communityId}
      communityName={communityName}
      initialType="tracks"
      initialWeeks={billboard.weeks}
      initialChartData={billboard.chartData}
    />
  );
}

export async function CommunityMobileWebShellAsync({
  communityId,
  viewerId,
  canInvite,
  showPromote,
  communityCreatedBy,
}: {
  communityId: string;
  viewerId: string;
  canInvite: boolean;
  showPromote: boolean;
  communityCreatedBy: string;
}) {
  const tz = (await headers()).get("x-vercel-ip-timezone") ?? undefined;
  const data = await loadCommunityMemberPageData({
    communityId,
    userId: viewerId,
    communityCreatedBy,
    timeZone: tz,
    canInvite,
  });
  return (
    <CommunityMobileWebShell
      communityId={communityId}
      viewerId={viewerId}
      canInvite={canInvite}
      showPromote={showPromote}
      initialFeedItems={data.feedPreload.items}
      initialFeedNextOffset={data.feedPreload.nextOffset}
      initialInsights={data.insights}
      initialWeeklySummary={data.weekly}
      initialTasteMatchScore={data.tasteMatchScore}
      initialMembersPage={data.rosterPage}
      initialMemberStats={data.memberStats}
      initialLeaderboard={data.leaderboard}
      initialInviteUrl={canInvite ? data.inviteUrl : undefined}
    />
  );
}

export async function CommunityInsightsSlot({
  communityId,
  hideTopArtists = false,
}: {
  communityId: string;
  /** When true, omits the "Top artists" block (e.g. when discovery carousels show artists). */
  hideTopArtists?: boolean;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const insights = await getCachedCommunityInsights(communityId);
  if (!insights) return null;
  return (
    <CommunityInsights
      insights={insights}
      hideTopArtists={hideTopArtists}
    />
  );
}

/** Desktop “Community pulse”: group listening insights + weekly trends (no album/artist rails). */
export function CommunityPulseSlot({
  communityId,
  insights,
  weeklySummaryPayload,
}: {
  communityId: string;
  insights: CommunityInsightsData | null;
  weeklySummaryPayload: CommunityWeeklySummaryBundle;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
      {insights ? (
        <CommunityInsights
          insights={insights}
          hideTopArtists
          headline="Group listening"
          description="Last 7 days · by time of day, all members."
        />
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-6 ring-1 ring-white/[0.04]">
          <p className={`${communityBody} text-zinc-500`}>
            No group listening snapshot yet.
          </p>
        </div>
      )}
      <CommunityWeeklySummary
        communityId={communityId}
        neutralCopy
        initialPayload={weeklySummaryPayload}
      />
    </div>
  );
}

export async function CommunityMembersSlot({
  communityId,
  viewerId,
  communityCreatedBy,
  showPromote,
}: {
  communityId: string;
  viewerId: string;
  communityCreatedBy: string;
  showPromote: boolean;
}) {
  const result = await getCachedCommunityMembersRosterPage1(
    communityId,
    viewerId,
    communityCreatedBy,
  );
  if (result.total === 0) {
    return <p className={`${communityBody} text-zinc-500`}>No members to show yet.</p>;
  }
  return (
    <CommunityMembersSectionClient
      communityId={communityId}
      viewerId={viewerId}
      showPromote={showPromote}
      initialTotal={result.total}
      initialPage={result.page}
      initialPageSize={result.pageSize}
      initialTotalPages={result.totalPages}
      initialRoster={result.roster}
      variant="social"
    />
  );
}

export async function CommunityLeaderboardSlot({
  communityId,
}: {
  communityId: string;
}) {
  const [leaderboard, memberStats] = await Promise.all([
    getCachedWeeklyLeaderboard(communityId),
    getCachedCommunityMemberStatsForLeaderboard(communityId),
  ]);
  return (
    <CommunityLeaderboardSection
      memberStats={memberStats}
      leaderboard={leaderboard}
    />
  );
}

export async function CommunityFeedSlot({
  communityId,
  preload,
}: {
  communityId: string;
  /** When set (e.g. shared with mobile web shell), avoids a second feed query. */
  preload?: CommunityFeedPreload;
}) {
  const bundle = preload ?? (await getCachedCommunityFeedPreload(communityId));
  const initialCommunityFeed = bundle.items;
  const initialFeedNextOffset = bundle.nextOffset;
  if (initialCommunityFeed.length === 0) {
    return <p className="text-sm text-zinc-500">No activity yet.</p>;
  }
  return (
    <CommunityFeedClient
      communityId={communityId}
      initialItems={initialCommunityFeed}
      initialNextOffset={initialFeedNextOffset}
    />
  );
}
