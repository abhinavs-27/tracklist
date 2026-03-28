"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityCollapsibleWeb } from "@/components/community/community-collapsible-web";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityInsights } from "@/components/community/CommunityInsights";
import { CommunityMembersSectionClient } from "@/components/community/community-members-section-client";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import type { CommunityConsensusRow } from "@/lib/community/getCommunityConsensus";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import type { CommunityMembersRosterPage } from "@/lib/community/get-community-members-roster";
import { communityBody, communityMeta } from "@/lib/ui/surface";

type Props = {
  communityId: string;
  viewerId: string;
  canInvite: boolean;
  showPromote: boolean;
  communityCreatedBy: string;
  initialFeedItems: CommunityFeedItemV2[];
  initialFeedNextOffset: number | null;
};

const LB_PREVIEW = 5;

export function CommunityMobileWebShell({
  communityId,
  viewerId,
  canInvite,
  showPromote,
  communityCreatedBy,
  initialFeedItems,
  initialFeedNextOffset,
}: Props) {
  const [tab, setTab] = useState<"top" | "activity">("top");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<CommunityInsightsData | null>(null);
  const [albumItems, setAlbumItems] = useState<CommunityConsensusRow[]>([]);
  const [artistItems, setArtistItems] = useState<CommunityConsensusRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<CommunityLeaderboardRow[]>([]);
  const [tasteMatchScore, setTasteMatchScore] = useState<number | null>(null);
  const [membersPage, setMembersPage] = useState<CommunityMembersRosterPage | null>(null);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);

  const load = useCallback(async () => {
    const base = `/api/communities/${encodeURIComponent(communityId)}`;
    try {
      const [insR, albR, artR, lbR, mtR, memR] = await Promise.all([
        fetch(`${base}/insights`, { cache: "no-store" }),
        fetch(`${base}/consensus?type=album&range=week&limit=16`, { cache: "no-store" }),
        fetch(`${base}/consensus?type=artist&range=week&limit=16`, { cache: "no-store" }),
        fetch(`${base}/leaderboard`, { cache: "no-store" }),
        fetch(`${base}/match`, { cache: "no-store" }),
        fetch(`${base}/members?page=1`, { cache: "no-store" }),
      ]);

      if (insR.ok) {
        const j = (await insR.json()) as { insights?: CommunityInsightsData };
        setInsights(j.insights ?? null);
      }
      if (albR.ok) {
        const j = (await albR.json()) as { items?: CommunityConsensusRow[] };
        setAlbumItems(j.items ?? []);
      }
      if (artR.ok) {
        const j = (await artR.json()) as { items?: CommunityConsensusRow[] };
        setArtistItems(j.items ?? []);
      }
      if (lbR.ok) {
        const j = (await lbR.json()) as { leaderboard?: CommunityLeaderboardRow[] };
        setLeaderboard(j.leaderboard ?? []);
      }
      if (mtR.ok) {
        const j = (await mtR.json()) as { score?: number };
        if (typeof j.score === "number") {
          setTasteMatchScore(j.score);
        }
      }
      if (memR.ok) {
        setMembersPage((await memR.json()) as CommunityMembersRosterPage);
      }
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewLb = leaderboardExpanded
    ? leaderboard
    : leaderboard.slice(0, LB_PREVIEW);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-zinc-900/50 p-1 ring-1 ring-white/[0.06]">
        <button
          type="button"
          onClick={() => setTab("top")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
            tab === "top"
              ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Top
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
            tab === "activity"
              ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Activity
        </button>
      </div>

      {tab === "top" ? (
        <div className="space-y-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
          ) : null}

          {tasteMatchScore != null ? (
            <CommunityTasteMatchCard score={tasteMatchScore} />
          ) : null}

          {canInvite ? <InviteMembersPanel communityId={communityId} /> : null}

          <CommunityCollapsibleWeb
            title="Top albums"
            subtitle="Shared favorites this week · scroll sideways"
            defaultOpen
          >
            {albumItems.length === 0 ? (
              <p className={`${communityMeta} text-zinc-500`}>
                No album consensus yet.
              </p>
            ) : (
              <ul className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                {albumItems.map((a) => (
                  <li key={a.entityId} className="w-[132px] shrink-0">
                    <Link
                      href={`/album/${a.entityId}`}
                      className="block rounded-xl border border-white/[0.08] bg-zinc-950/50 p-2.5 ring-1 ring-white/[0.05] transition hover:border-emerald-500/25"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900">
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-zinc-600">
                            ♪
                          </div>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">
                        {a.name}
                      </p>
                      <p className={communityMeta}>
                        {a.uniqueListeners} listener
                        {a.uniqueListeners === 1 ? "" : "s"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommunityCollapsibleWeb>

          <CommunityCollapsibleWeb
            title="Top artists"
            subtitle="Who people are rallying around"
            defaultOpen
          >
            {artistItems.length === 0 ? (
              <p className={`${communityMeta} text-zinc-500`}>
                No artist consensus yet.
              </p>
            ) : (
              <ul className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                {artistItems.map((a) => (
                  <li key={a.entityId} className="w-[132px] shrink-0">
                    <Link
                      href={`/artist/${a.entityId}`}
                      className="block rounded-xl border border-white/[0.08] bg-zinc-950/50 p-2.5 ring-1 ring-white/[0.05] transition hover:border-emerald-500/25"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-full bg-zinc-900">
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-zinc-600">
                            ?
                          </div>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">
                        {a.name}
                      </p>
                      <p className={communityMeta}>
                        {a.uniqueListeners} listener
                        {a.uniqueListeners === 1 ? "" : "s"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommunityCollapsibleWeb>

          <CommunityCollapsibleWeb
            title="Community consensus"
            subtitle="Songs, albums & artists — ranked by shared listening (capped plays)"
            defaultOpen
          >
            <CommunityConsensusSection communityId={communityId} embedded />
          </CommunityCollapsibleWeb>

          <CommunityCollapsibleWeb
            title="This week’s leaderboard"
            subtitle="Last 7 days · by listens"
            defaultOpen
          >
            {leaderboard.length === 0 ? (
              <p className={`${communityBody} text-zinc-500`}>
                No listens logged this week yet.
              </p>
            ) : (
              <>
                <ol className="space-y-2">
                  {previewLb.map((row, i) => (
                    <li
                      key={row.userId}
                      className="flex items-center gap-3 rounded-xl bg-zinc-950/40 px-3 py-2.5 ring-1 ring-white/[0.05]"
                    >
                      <span className={`w-6 ${communityMeta}`}>{i + 1}</span>
                      <Link href={`/profile/${row.userId}`} className="shrink-0">
                        {row.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.avatar_url}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-200 ring-1 ring-white/10">
                            {row.username[0]?.toUpperCase() ?? "?"}
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/profile/${row.userId}`}
                          className={`font-medium text-white hover:text-emerald-400 hover:underline ${communityBody}`}
                        >
                          {row.username}
                        </Link>
                        <p className={communityMeta}>
                          {row.totalLogs} listens · {row.uniqueArtists} artists
                          {row.streakDays > 0 ? (
                            <span className="text-amber-400">
                              {" "}
                              · {row.streakDays}d streak
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                {leaderboard.length > LB_PREVIEW ? (
                  <button
                    type="button"
                    onClick={() => setLeaderboardExpanded((e) => !e)}
                    className="mt-3 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    {leaderboardExpanded ? "Show less" : "View all"}
                  </button>
                ) : null}
              </>
            )}
          </CommunityCollapsibleWeb>

          {insights ? (
            <CommunityCollapsibleWeb
              title="Group insights"
              subtitle="Exploration, diversity, time patterns"
              defaultOpen={false}
            >
              <CommunityInsights
                insights={insights}
                hideTopArtists
                embedded
              />
            </CommunityCollapsibleWeb>
          ) : null}

          {membersPage && membersPage.total > 0 ? (
            <CommunityCollapsibleWeb
              title="People in this community"
              subtitle={`${membersPage.total} member${membersPage.total === 1 ? "" : "s"}`}
              defaultOpen={false}
            >
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
              />
            </CommunityCollapsibleWeb>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className={`${communityBody} text-zinc-500`}>
            Filters, listens, reviews, and milestones — tuned for easier scanning on
            small screens.
          </p>
          <CommunityFeedClient
            communityId={communityId}
            initialItems={initialFeedItems}
            initialNextOffset={initialFeedNextOffset}
            listSpacingClassName="space-y-5"
          />
        </div>
      )}
    </div>
  );
}
