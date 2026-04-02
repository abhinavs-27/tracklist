"use client";

import { useState } from "react";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityCollapsibleWeb } from "@/components/community/community-collapsible-web";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityLeaderboardClient } from "@/components/community/community-leaderboard-client";
import { CommunityMembersSectionClient } from "@/components/community/community-members-section-client";
import { CommunityPageSection } from "@/components/community/community-page-section";
import { CommunityWeeklyBillboardClient } from "@/components/community/community-weekly-billboard-client";
import { CommunityWeeklySummary } from "@/components/community/community-weekly-summary";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import type {
  CommunityBillboardInitial,
  CommunityWeeklySummaryBundle,
} from "@/lib/community/community-page-cache";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityMemberStatRow } from "@/lib/community/get-community-member-stats";
import type { CommunityMembersRosterPage } from "@/lib/community/get-community-members-roster";
import { communityBody, communityMeta } from "@/lib/ui/surface";

type Props = {
  communityId: string;
  communityName: string;
  viewerId: string;
  canInvite: boolean;
  showPromote: boolean;
  initialFeedItems: CommunityFeedItemV2[];
  initialFeedNextOffset: number | null;
  initialInsights: CommunityInsightsData | null;
  initialWeeklySummary: CommunityWeeklySummaryBundle;
  initialTasteMatchScore: number;
  initialMembersPage: CommunityMembersRosterPage;
  initialMemberStats: CommunityMemberStatRow[];
  initialLeaderboard: CommunityLeaderboardRow[];
  initialBillboard: CommunityBillboardInitial;
  /** When `canInvite` is false, omit (undefined). When true, pass server value (string or null). */
  initialInviteUrl?: string | null;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function timeBarPct(
  insights: CommunityInsightsData,
  key: keyof CommunityInsightsData["timeOfDay"],
): number {
  const t =
    insights.timeOfDay.morning +
    insights.timeOfDay.afternoon +
    insights.timeOfDay.night +
    insights.timeOfDay.lateNight;
  if (t === 0) return 0;
  return Math.round((insights.timeOfDay[key] / t) * 100);
}

export function CommunityMobileWebShell({
  communityId,
  communityName,
  viewerId,
  canInvite,
  showPromote,
  initialFeedItems,
  initialFeedNextOffset,
  initialInsights,
  initialWeeklySummary,
  initialTasteMatchScore,
  initialMembersPage,
  initialMemberStats,
  initialLeaderboard,
  initialBillboard,
  initialInviteUrl,
}: Props) {
  const [tab, setTab] = useState<"vibe" | "people" | "activity">("vibe");
  const [insights] = useState<CommunityInsightsData | null>(initialInsights);
  const [weekly] = useState(() => ({
    current: initialWeeklySummary.current
      ? {
          top_genres: initialWeeklySummary.current.top_genres,
          top_styles: initialWeeklySummary.current.top_styles,
        }
      : null,
  }));
  const [tasteMatchScore] = useState<number | null>(initialTasteMatchScore);
  const [membersPage] = useState<CommunityMembersRosterPage | null>(
    initialMembersPage,
  );

  const genres = weekly?.current?.top_genres ?? [];
  const styleRows = weekly?.current?.top_styles ?? [];
  const maxG = Math.max(1, ...genres.map((g) => g.weight));

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 rounded-xl bg-zinc-900/50 p-1 ring-1 ring-white/[0.06] sm:gap-2">
        {(
          [
            ["vibe", "Vibe"],
            ["people", "People"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all duration-200 ease-out will-change-transform active:scale-[0.98] sm:text-sm ${
              tab === id
                ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={tab === "vibe" ? "block" : "hidden"}
        aria-hidden={tab !== "vibe"}
      >
        <div className="space-y-8">
          <CommunityPageSection
            eyebrow="Billboard"
            title={`${communityName} Weekly Chart`}
            description="Top 10 by combined member plays each UTC week. Charts lock after publish."
          >
            <CommunityWeeklyBillboardClient
              communityId={communityId}
              initialType="tracks"
              initialWeeks={initialBillboard.weeks}
              initialChartData={initialBillboard.chartData}
            />
          </CommunityPageSection>

          <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/40 to-zinc-950/30 p-1 ring-1 ring-white/[0.04]">
            <CommunityPageSection
              className="px-1 sm:px-0"
              eyebrow="Together"
              title="Community consensus"
              description="Songs, albums, and artists ranked by how members listen together."
            >
              <CommunityConsensusSection communityId={communityId} embedded />
            </CommunityPageSection>
          </div>

          <div className="space-y-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-500">
              Community vibe
            </p>
            <p
              className={`mt-2 text-sm leading-relaxed text-zinc-400 ${communityMeta}`}
            >
              What this group sounds like — genres and shared favorites.
            </p>
          </div>

          {tasteMatchScore != null ? (
            <CommunityTasteMatchCard score={tasteMatchScore} />
          ) : null}

          {canInvite ? (
            <InviteMembersPanel
              communityId={communityId}
              initialInviteUrl={initialInviteUrl}
            />
          ) : null}

          {insights ? (
            <>
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/20 px-3 py-3 ring-1 ring-emerald-500/10">
                <p
                  className={`font-medium leading-relaxed text-zinc-100 ${communityBody}`}
                >
                  {insights.summary}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 ring-1 ring-white/[0.05]">
                  <p className="text-2xl font-extrabold tabular-nums text-emerald-400">
                    {pct(insights.explorationScore)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">
                    Exploration
                  </p>
                  <p
                    className={`mt-1 text-xs leading-snug text-zinc-500 ${communityMeta}`}
                  >
                    {insights.explorationLabel}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3 ring-1 ring-white/[0.05]">
                  <p className="text-2xl font-extrabold tabular-nums text-amber-400/90">
                    {pct(insights.diversityScore)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">
                    Taste overlap
                  </p>
                  <p
                    className={`mt-1 text-xs leading-snug text-zinc-500 ${communityMeta}`}
                  >
                    {insights.diversityLabel}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-zinc-950/40 p-4 ring-1 ring-white/[0.05]">
                <p className="text-sm font-semibold text-zinc-100">
                  Listening clock
                </p>
                <p className={`mt-1 text-xs text-zinc-500 ${communityMeta}`}>
                  Strongest: {insights.dominantTime} · by time of day
                </p>
                <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="bg-sky-500/90"
                    style={{
                      flex: Math.max(1, timeBarPct(insights, "morning")),
                    }}
                  />
                  <div
                    className="bg-amber-500/90"
                    style={{
                      flex: Math.max(1, timeBarPct(insights, "afternoon")),
                    }}
                  />
                  <div
                    className="bg-violet-500/90"
                    style={{ flex: Math.max(1, timeBarPct(insights, "night")) }}
                  />
                  <div
                    className="bg-indigo-600/90"
                    style={{
                      flex: Math.max(1, timeBarPct(insights, "lateNight")),
                    }}
                  />
                </div>
                <p
                  className={`mt-2 text-[11px] text-zinc-500 ${communityMeta}`}
                >
                  Morning → afternoon → evening → late night
                </p>
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Top genres</p>
              <p className={`text-xs text-zinc-500 ${communityMeta}`}>
                Weighted by group listening
              </p>
            </div>
            {genres.length === 0 ? (
              <p className={`${communityMeta} text-zinc-500`}>
                No genre snapshot yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {genres.slice(0, 8).map((g) => (
                  <li key={g.name}>
                    <p
                      className={`truncate text-sm font-medium text-zinc-200 ${communityBody}`}
                    >
                      {g.name}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.max(8, (g.weight / maxG) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {styleRows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-100">
                Listening styles
              </p>
              <p className={`text-xs text-zinc-500 ${communityMeta}`}>
                Share of group taste
              </p>
              <div className="flex flex-wrap gap-2">
                {styleRows.slice(0, 10).map((s) => (
                  <span
                    key={s.style}
                    className="rounded-full border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-sm font-semibold text-zinc-200"
                  >
                    {s.style} · {Math.round(s.share * 100)}%
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <CommunityCollapsibleWeb
            title="Listening & trends"
            subtitle="Deeper genre snapshot and local-time activity — complements the blocks above."
            defaultOpen={false}
          >
            <CommunityWeeklySummary
              communityId={communityId}
              neutralCopy
              bare
              initialPayload={initialWeeklySummary}
            />
          </CommunityCollapsibleWeb>
          </div>
        </div>
      </div>

      <div
        className={tab === "people" ? "block" : "hidden"}
        aria-hidden={tab !== "people"}
      >
        <div className="space-y-3">
          <p
            className={`text-sm leading-relaxed text-zinc-500 ${communityBody}`}
          >
            Weekly listen leaders, then everyone here — compatibility vs your
            taste and a standout artist from each profile.
          </p>
          <CommunityLeaderboardClient
            communityId={communityId}
            initialMemberStats={initialMemberStats}
            initialLeaderboard={initialLeaderboard}
          />
          {membersPage && membersPage.total > 0 ? (
            <CommunityMembersSectionClient
              communityId={communityId}
              viewerId={viewerId}
              showPromote={showPromote}
              initialTotal={membersPage.total}
              initialPage={membersPage.page}
              initialPageSize={membersPage.pageSize}
              initialTotalPages={membersPage.totalPages}
              initialRoster={membersPage.roster}
              embedded
              variant="social"
            />
          ) : (
            <p className={`${communityBody} text-zinc-500`}>
              No members to show yet.
            </p>
          )}
        </div>
      </div>

      <div
        className={tab === "activity" ? "block" : "hidden"}
        aria-hidden={tab !== "activity"}
      >
        <div className="space-y-3">
          <p className={`${communityBody} text-zinc-500`}>
            Filters, listens, reviews, and milestones — tuned for easier
            scanning on small screens.
          </p>
          <CommunityFeedClient
            communityId={communityId}
            initialItems={initialFeedItems}
            initialNextOffset={initialFeedNextOffset}
            listSpacingClassName="space-y-5"
          />
        </div>
      </div>
   </div>
  );
}
