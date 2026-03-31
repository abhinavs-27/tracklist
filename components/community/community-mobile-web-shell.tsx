"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CommunityTasteMatchCard } from "@/components/community-taste-match";
import { CommunityCollapsibleWeb } from "@/components/community/community-collapsible-web";
import { CommunityConsensusSection } from "@/components/community/community-consensus";
import { CommunityFeedClient } from "@/components/community/community-feed-client";
import { CommunityMembersSectionClient } from "@/components/community/community-members-section-client";
import { InviteMembersPanel } from "@/components/invite-members-panel";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import type { CommunityConsensusRow } from "@/lib/community/getCommunityConsensus";
import type { CommunityLeaderboardRow } from "@/lib/community/getWeeklyLeaderboard";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import type { CommunityMembersRosterPage } from "@/lib/community/get-community-members-roster";
import { communityBody, communityMeta } from "@/lib/ui/surface";
import {
  CommunityMobilePeopleTabSkeleton,
  CommunityMobileVibeTabSkeleton,
} from "@/components/community/community-mobile-web-tab-skeleton";

type Props = {
  communityId: string;
  viewerId: string;
  canInvite: boolean;
  showPromote: boolean;
  initialFeedItems: CommunityFeedItemV2[];
  initialFeedNextOffset: number | null;
};

type WeeklyBundle = {
  current: {
    top_genres: { name: string; weight: number }[];
    top_styles: { style: string; share: number }[];
  } | null;
  trend: { genres: { gained: string[]; lost: string[] } } | null;
};

const LB_PREVIEW = 5;

const tabPanelClass =
  "max-h-[min(76dvh,calc(100dvh-17rem))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]";

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
  viewerId,
  canInvite,
  showPromote,
  initialFeedItems,
  initialFeedNextOffset,
}: Props) {
  const [tab, setTab] = useState<"vibe" | "people" | "activity">("vibe");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<CommunityInsightsData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyBundle | null>(null);
  const [albumItems, setAlbumItems] = useState<CommunityConsensusRow[]>([]);
  const [artistItems, setArtistItems] = useState<CommunityConsensusRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<CommunityLeaderboardRow[]>([]);
  const [tasteMatchScore, setTasteMatchScore] = useState<number | null>(null);
  const [membersPage, setMembersPage] =
    useState<CommunityMembersRosterPage | null>(null);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);

  const vibeScrollRef = useRef<HTMLDivElement>(null);
  const peopleScrollRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const scrollMemory = useRef({ vibe: 0, people: 0, activity: 0 });

  const load = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const base = `/api/communities/${encodeURIComponent(communityId)}`;
    try {
      const [insR, wkR, albR, artR, lbR, mtR, memR] = await Promise.all([
        fetch(`${base}/insights`, { cache: "no-store" }),
        fetch(`${base}/weekly-summary?timeZone=${encodeURIComponent(tz)}`, {
          cache: "no-store",
        }),
        fetch(`${base}/consensus?type=album&range=week&limit=16`, {
          cache: "no-store",
        }),
        fetch(`${base}/consensus?type=artist&range=week&limit=16`, {
          cache: "no-store",
        }),
        fetch(`${base}/leaderboard`, { cache: "no-store" }),
        fetch(`${base}/match`, { cache: "no-store" }),
        fetch(`${base}/members?page=1`, { cache: "no-store" }),
      ]);

      if (insR.ok) {
        const j = (await insR.json()) as { insights?: CommunityInsightsData };
        setInsights(j.insights ?? null);
      }
      if (wkR.ok) {
        const j = (await wkR.json()) as WeeklyBundle;
        setWeekly(j);
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
        const j = (await lbR.json()) as {
          leaderboard?: CommunityLeaderboardRow[];
        };
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

  const switchTab = useCallback(
    (next: "vibe" | "people" | "activity") => {
      if (tab === "vibe" && vibeScrollRef.current) {
        scrollMemory.current.vibe = vibeScrollRef.current.scrollTop;
      }
      if (tab === "people" && peopleScrollRef.current) {
        scrollMemory.current.people = peopleScrollRef.current.scrollTop;
      }
      if (tab === "activity" && activityScrollRef.current) {
        scrollMemory.current.activity = activityScrollRef.current.scrollTop;
      }
      setTab(next);
    },
    [tab],
  );

  useLayoutEffect(() => {
    const el =
      tab === "vibe"
        ? vibeScrollRef.current
        : tab === "people"
          ? peopleScrollRef.current
          : activityScrollRef.current;
    if (!el) return;
    const y =
      tab === "vibe"
        ? scrollMemory.current.vibe
        : tab === "people"
          ? scrollMemory.current.people
          : scrollMemory.current.activity;
    el.scrollTop = y;
  }, [tab]);

  const previewLb = leaderboardExpanded
    ? leaderboard
    : leaderboard.slice(0, LB_PREVIEW);

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
            onClick={() => switchTab(id)}
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
        ref={vibeScrollRef}
        className={`${tab === "vibe" ? "block" : "hidden"} ${tabPanelClass}`}
        aria-hidden={tab !== "vibe"}
      >
        <div className="space-y-4">
          {loading ? (
            <CommunityMobileVibeTabSkeleton />
          ) : (
            <>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-500">
              Community vibe
            </p>
            <p
              className={`mt-2 text-sm leading-relaxed text-zinc-400 ${communityMeta}`}
            >
              What this group sounds like lately — genres, momentum, and shared
              favorites.
            </p>
          </div>

          {tasteMatchScore != null ? (
            <CommunityTasteMatchCard score={tasteMatchScore} />
          ) : null}

          {canInvite ? <InviteMembersPanel communityId={communityId} /> : null}

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
              <p className="text-sm font-semibold text-zinc-100">
                Top genres this week
              </p>
              <p className={`text-xs text-zinc-500 ${communityMeta}`}>
                Weighted by group listening
              </p>
            </div>
            {loading ? null : genres.length === 0 ? (
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
                Share of group taste this week
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
            title="Trending artists"
            subtitle="Who the group is rallying around"
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
            title="Albums in rotation"
            subtitle="Shared favorites"
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
            title="Community consensus"
            subtitle="Songs, albums & artists — ranked by shared listening (capped plays)"
            defaultOpen={false}
          >
            <CommunityConsensusSection communityId={communityId} embedded />
          </CommunityCollapsibleWeb>

          <CommunityCollapsibleWeb
            title="This week’s spin leaders"
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
                      <Link
                        href={`/profile/${row.userId}`}
                        className="shrink-0"
                      >
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

          {weekly?.trend &&
          (weekly.trend.genres.gained.length > 0 ||
            weekly.trend.genres.lost.length > 0) ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-4 ring-1 ring-emerald-500/10">
              <p className="text-sm font-semibold text-zinc-100">
                This week&apos;s genre leaders
              </p>
              <p className={`mt-1 text-xs text-zinc-500 ${communityMeta}`}>
                Momentum vs last week — genres surging or cooling in the group
              </p>
              {weekly.trend.genres.gained.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {weekly.trend.genres.gained.slice(0, 10).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-emerald-500/35 bg-emerald-950/50 px-3 py-1.5 text-sm font-medium text-emerald-200"
                    >
                      ↑ {g}
                    </span>
                  ))}
                </div>
              ) : null}
              {weekly.trend.genres.lost.length > 0 ? (
                <div
                  className={
                    weekly.trend.genres.gained.length > 0
                      ? "mt-4 flex flex-wrap gap-2"
                      : "mt-3 flex flex-wrap gap-2"
                  }
                >
                  {weekly.trend.genres.lost.slice(0, 10).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-sm font-medium text-rose-200/95"
                    >
                      ↓ {g}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
            </>
          )}
        </div>
      </div>

      <div
        ref={peopleScrollRef}
        className={`${tab === "people" ? "block" : "hidden"} ${tabPanelClass}`}
        aria-hidden={tab !== "people"}
      >
        <div className="space-y-3">
          <p
            className={`text-sm leading-relaxed text-zinc-500 ${communityBody}`}
          >
            Discover who&apos;s here — compatibility vs your taste, and a
            standout artist from their profile.
          </p>
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
          ) : loading ? (
            <CommunityMobilePeopleTabSkeleton />
          ) : (
            <p className={`${communityBody} text-zinc-500`}>
              No members to show yet.
            </p>
          )}
        </div>
      </div>

      <div
        ref={activityScrollRef}
        className={`${tab === "activity" ? "block" : "hidden"} ${tabPanelClass}`}
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
