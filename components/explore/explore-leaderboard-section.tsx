import { getExploreLeaderboardPayload } from "@/lib/explore-hub-data";
import { exploreSectionOrFallback } from "@/lib/explore-section-timeout";
import { LeaderboardPreview } from "@/components/explore/leaderboard-preview";

export async function ExploreLeaderboardSection() {
  const { leaderboard } = await exploreSectionOrFallback(
    () => getExploreLeaderboardPayload(),
    { leaderboard: [] },
  );
  return <LeaderboardPreview entries={leaderboard} />;
}
