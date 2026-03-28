import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { CommunityLeaderboardSection } from "@/components/community/community-leaderboard-section";
import { CommunityTastePeers } from "@/components/community/community-taste-peers";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { COMMUNITY_FEED_PAGE_SIZE } from "@/lib/community/community-feed-page-size";
import { getCommunityFeedV2 } from "@/lib/community/get-community-feed-v2";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { getCommunityTasteMatchesForViewer } from "@/lib/community/get-community-taste-matches";
import { getWeeklyLeaderboard } from "@/lib/community/getWeeklyLeaderboard";
import { getCommunityMatch } from "@/lib/taste/getCommunityMatch";

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

export async function CommunityInsightsSlot({ communityId }: { communityId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const insights = await getCommunityInsights(communityId);
  if (!insights) return null;
  return <CommunityInsights insights={insights} />;
}

export async function CommunityTastePeersSlot({
  communityId,
  userId,
}: {
  communityId: string;
  userId: string;
}) {
  const peers = await getCommunityTasteMatchesForViewer(communityId, userId);
  return <CommunityTastePeers similar={peers.similar} opposite={peers.opposite} />;
}

export async function CommunityLeaderboardSlot({ communityId }: { communityId: string }) {
  const [leaderboard, memberStats] = await Promise.all([
    getWeeklyLeaderboard(communityId),
    getCommunityMemberStatsWithRoles(communityId),
  ]);
  return (
    <CommunityLeaderboardSection memberStats={memberStats} leaderboard={leaderboard} />
  );
}

export async function CommunityFeedSlot({ communityId }: { communityId: string }) {
  const initialCommunityFeed = await getCommunityFeedV2(
    communityId,
    COMMUNITY_FEED_PAGE_SIZE,
    "all",
    0,
  );
  const initialFeedNextOffset =
    initialCommunityFeed.length >= COMMUNITY_FEED_PAGE_SIZE
      ? COMMUNITY_FEED_PAGE_SIZE
      : null;
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
