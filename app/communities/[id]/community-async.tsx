import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { CommunityLeaderboardSection } from "@/components/community/community-leaderboard-section";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { COMMUNITY_FEED_PAGE_SIZE } from "@/lib/community/community-feed-page-size";
import { CommunityMembersSectionClient } from "@/components/community/community-members-section-client";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { getCommunityFeedV2 } from "@/lib/community/get-community-feed-v2";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
import { getCommunityMembersRoster } from "@/lib/community/get-community-members-roster";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { getWeeklyLeaderboard } from "@/lib/community/getWeeklyLeaderboard";
import { getCommunityMatch } from "@/lib/taste/getCommunityMatch";
import { communityBody } from "@/lib/ui/surface";

export type CommunityFeedPreload = {
  items: CommunityFeedItemV2[];
  nextOffset: number | null;
};

export async function getCommunityFeedPreload(
  communityId: string,
): Promise<CommunityFeedPreload> {
  const items = await getCommunityFeedV2(
    communityId,
    COMMUNITY_FEED_PAGE_SIZE,
    "all",
    0,
  );
  const nextOffset =
    items.length >= COMMUNITY_FEED_PAGE_SIZE ? COMMUNITY_FEED_PAGE_SIZE : null;
  return { items, nextOffset };
}

export async function CommunityTasteMatchSlot({
  userId,
  communityId,
}: {
  userId: string;
  communityId: string;
}) {
  const { score } = await getCommunityMatch(userId, communityId);
  return <CommunityTasteMatchCard score={score} />;
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
  const insights = await getCommunityInsights(communityId);
  if (!insights) return null;
  return (
    <CommunityInsights
      insights={insights}
      hideTopArtists={hideTopArtists}
    />
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
  const result = await getCommunityMembersRoster(
    communityId,
    viewerId,
    communityCreatedBy,
    { page: 1 },
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
    />
  );
}

export async function CommunityLeaderboardSlot({
  communityId,
}: {
  communityId: string;
}) {
  const [leaderboard, memberStats] = await Promise.all([
    getWeeklyLeaderboard(communityId),
    getCommunityMemberStatsWithRoles(communityId),
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
  const bundle = preload ?? (await getCommunityFeedPreload(communityId));
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
