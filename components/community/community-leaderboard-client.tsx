"use client";

import { useCallback, useEffect, useState } from "react";
import { CommunityLeaderboardList } from "@/components/community/community-leaderboard-list";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";
import { communityBody, communityCard } from "@/lib/ui/surface";

export function CommunityLeaderboardClient({ communityId }: { communityId: string }) {
  const [memberStats, setMemberStats] = useState<CommunityMemberStatRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<CommunityLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const base = `/api/communities/${encodeURIComponent(communityId)}`;
    try {
      const [statsRes, lbRes] = await Promise.all([
        fetch(`${base}/members/stats?limit=50`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`${base}/leaderboard`, { cache: "no-store", credentials: "include" }),
      ]);

      if (statsRes.ok) {
        const j = (await statsRes.json()) as { members?: CommunityMemberStatRow[] };
        setMemberStats(j.members ?? []);
      } else {
        setMemberStats([]);
      }

      if (lbRes.ok) {
        const j = (await lbRes.json()) as { leaderboard?: CommunityLeaderboardRow[] };
        setLeaderboard(j.leaderboard ?? []);
      } else {
        setLeaderboard([]);
      }
    } catch {
      setError("Could not load leaderboard");
      setMemberStats([]);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-24 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
    );
  }

  if (error) {
    return <p className={`${communityBody} text-zinc-500`}>{error}</p>;
  }

  return (
    <div className={communityCard}>
      <CommunityLeaderboardList
        memberStats={memberStats}
        leaderboard={leaderboard}
        heading="Weekly listen leaders"
        description="Last 7 days · sorted by total listens."
      />
    </div>
  );
}
