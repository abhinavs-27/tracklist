import { cache } from "react";

import {
  getCommunityWeeklyChart,
  listCommunityWeeklyChartWeeks,
} from "@/lib/charts/get-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import type { LatestWeeklyChartApiResult } from "@/lib/charts/get-user-weekly-chart";
import { getAppBaseUrl } from "@/lib/app-url";
import { COMMUNITY_FEED_PAGE_SIZE } from "@/lib/community/community-feed-page-size";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { getCommunityFeedV2 } from "@/lib/community/get-community-feed-v2";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import {
  getCommunityMembersRoster,
  type CommunityMembersRosterPage,
} from "@/lib/community/get-community-members-roster";
import {
  getCommunityWeeklySummaryWithTrend,
} from "@/lib/community/get-community-weekly-summary";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
import { getLatestActiveInviteLinkTokenForCommunity } from "@/lib/community/invite-links";
import { getWeeklyLeaderboard } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";
import { getCommunityMatch } from "@/lib/taste/getCommunityMatch";

export type CommunityFeedPreload = {
  items: CommunityFeedItemV2[];
  nextOffset: number | null;
};

export type CommunityBillboardInitial = {
  weeks: { week_start: string; week_end: string }[];
  chartData: LatestWeeklyChartApiResult | null;
};

export const getCachedCommunityInsights = cache(async (communityId: string) => {
  return getCommunityInsights(communityId);
});

export const getCachedCommunityMatch = cache(
  async (userId: string, communityId: string) => {
    return getCommunityMatch(userId, communityId);
  },
);

export const getCachedCommunityWeeklySummaryWithTrend = cache(
  async (communityId: string, timeZone: string | undefined) => {
    return getCommunityWeeklySummaryWithTrend(
      communityId,
      timeZone ? { timeZone } : undefined,
    );
  },
);

export const getCachedWeeklyLeaderboard = cache(async (communityId: string) => {
  return getWeeklyLeaderboard(communityId);
});

/** Same limit as `GET …/members/stats?limit=50` and community leaderboard client. */
export const getCachedCommunityMemberStatsForLeaderboard = cache(
  async (communityId: string) => {
    return getCommunityMemberStatsWithRoles(communityId, 50, 0);
  },
);

export const getCachedCommunityMembersRosterPage1 = cache(
  async (
    communityId: string,
    viewerId: string,
    communityCreatedBy: string,
  ): Promise<CommunityMembersRosterPage> => {
    return getCommunityMembersRoster(communityId, viewerId, communityCreatedBy, {
      page: 1,
    });
  },
);

export const getCachedCommunityFeedPreload = cache(
  async (communityId: string): Promise<CommunityFeedPreload> => {
    const items = await getCommunityFeedV2(
      communityId,
      COMMUNITY_FEED_PAGE_SIZE,
      "all",
      0,
    );
    const nextOffset =
      items.length >= COMMUNITY_FEED_PAGE_SIZE ? COMMUNITY_FEED_PAGE_SIZE : null;
    return { items, nextOffset };
  },
);

export const getCachedCommunityInviteUrl = cache(
  async (communityId: string, userId: string): Promise<string | null> => {
    const result = await getLatestActiveInviteLinkTokenForCommunity({
      communityId,
      actorUserId: userId,
    });
    if (!result.ok || !result.token) return null;
    const base = getAppBaseUrl().replace(/\/$/, "");
    return `${base}/community/join/${result.token}`;
  },
);

const INITIAL_BILLBOARD_TYPE: ChartType = "tracks";

export const getCachedCommunityBillboardTracksInitial = cache(
  async (
    communityId: string,
    viewerId: string,
  ): Promise<CommunityBillboardInitial> => {
    const [weeks, chartData] = await Promise.all([
      listCommunityWeeklyChartWeeks({
        communityId,
        chartType: INITIAL_BILLBOARD_TYPE,
      }),
      getCommunityWeeklyChart({
        communityId,
        chartType: INITIAL_BILLBOARD_TYPE,
        weekStart: null,
        viewerId,
      }),
    ]);
    return { weeks, chartData };
  },
);

export type CommunityWeeklySummaryBundle = Awaited<
  ReturnType<typeof getCommunityWeeklySummaryWithTrend>
>;

export type CommunityMemberPageData = {
  feedPreload: CommunityFeedPreload;
  insights: Awaited<ReturnType<typeof getCommunityInsights>>;
  tasteMatchScore: number;
  weekly: CommunityWeeklySummaryBundle;
  leaderboard: CommunityLeaderboardRow[];
  memberStats: CommunityMemberStatRow[];
  rosterPage: CommunityMembersRosterPage;
  inviteUrl: string | null;
  billboard: CommunityBillboardInitial;
};

export async function loadCommunityMemberPageData(args: {
  communityId: string;
  userId: string;
  communityCreatedBy: string;
  timeZone: string | undefined;
  canInvite: boolean;
}): Promise<CommunityMemberPageData> {
  const {
    communityId,
    userId,
    communityCreatedBy,
    timeZone,
    canInvite,
  } = args;

  const [
    feedPreload,
    insights,
    match,
    weekly,
    leaderboard,
    memberStats,
    rosterPage,
    billboard,
  ] = await Promise.all([
    getCachedCommunityFeedPreload(communityId),
    getCachedCommunityInsights(communityId),
    getCachedCommunityMatch(userId, communityId),
    getCachedCommunityWeeklySummaryWithTrend(communityId, timeZone),
    getCachedWeeklyLeaderboard(communityId),
    getCachedCommunityMemberStatsForLeaderboard(communityId),
    getCachedCommunityMembersRosterPage1(communityId, userId, communityCreatedBy),
    getCachedCommunityBillboardTracksInitial(communityId, userId),
  ]);

  const inviteUrl = canInvite
    ? await getCachedCommunityInviteUrl(communityId, userId)
    : null;

  return {
    feedPreload,
    insights,
    tasteMatchScore: match.score,
    weekly,
    leaderboard,
    memberStats,
    rosterPage,
    inviteUrl,
    billboard,
  };
}
