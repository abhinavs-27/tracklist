import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";
import { CommunityLeaderboardList } from "@/components/community/community-leaderboard-list";
import { communityCard } from "@/lib/ui/surface";

type Props = {
  memberStats: CommunityMemberStatRow[];
  leaderboard: CommunityLeaderboardRow[];
};

/**
 * Server-rendered leaderboard (member stats from RPC when available, else weekly job).
 */
export function CommunityLeaderboardSection({ memberStats, leaderboard }: Props) {
  return (
    <section className={communityCard}>
      <CommunityLeaderboardList
        memberStats={memberStats}
        leaderboard={leaderboard}
        heading="Weekly listen leaders"
        description="Last 7 days · sorted by total listens. Badges update with the weekly job."
      />
    </section>
  );
}
