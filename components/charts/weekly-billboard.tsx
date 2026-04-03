"use client";

import { memo, useMemo, useState } from "react";
import { ChartShareActions } from "@/components/charts/chart-share-actions";
import { ChartShareModal } from "@/components/charts/chart-share-modal";
import { CommunityChartDropCountdown } from "@/components/community/community-chart-drop-countdown";
import type { WeeklyChartMoversApi } from "@/lib/charts/get-user-weekly-chart";
import type { HydratedWeeklyChartDropout } from "@/lib/charts/hydrate-weekly-chart";
import type {
  ChartMomentPayload,
  ChartType,
  WeeklyChartRankingApiRow,
} from "@/lib/charts/weekly-chart-types";

function repeatStrengthLabel(rs: number | null): string | null {
  if (rs == null) return null;
  if (rs >= 1.75) return "Strong repeat listening";
  if (rs >= 1.2) return "Solid repeat listening";
  return "Wide reach across listeners";
}

function communityMovementRowClass(row: WeeklyChartRankingApiRow): string {
  if (row.rank_movement === "UP") return "animate-chart-row-up";
  if (row.rank_movement === "DOWN") return "animate-chart-row-down";
  if (row.rank_movement === "NEW") return "animate-chart-row-new";
  return "";
}

function CommunityRankMovementIndicator({
  row,
}: {
  row: WeeklyChartRankingApiRow;
}) {
  const rm = row.rank_movement;
  if (rm != null) {
    if (rm === "NEW") {
      return (
        <span className="inline-flex items-center rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-sky-500/30">
          NEW
        </span>
      );
    }
    if (rm === "UP" && row.rank_delta != null && row.rank_delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-emerald-400/95 tabular-nums">
          <span aria-hidden>▲</span>
          <span>+{row.rank_delta}</span>
        </span>
      );
    }
    if (rm === "DOWN" && row.rank_delta != null && row.rank_delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-rose-400/95 tabular-nums">
          <span aria-hidden>▼</span>
          <span>−{row.rank_delta}</span>
        </span>
      );
    }
    if (rm === "SAME") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-zinc-500 tabular-nums">
          <span className="text-zinc-600" aria-hidden>
            —
          </span>
          <span className="sr-only">No change</span>
        </span>
      );
    }
  }
  return <MovementIndicator row={row} />;
}

function CommunityBreakdownBody({ row }: { row: WeeklyChartRankingApiRow }) {
  const b = row.community_breakdown;
  if (!b) return null;
  const pct =
    b.percent_of_community != null
      ? Math.round(b.percent_of_community * 100)
      : null;
  const ledBy = b.top_contributors
    .map((c) => c.username?.trim() || "Member")
    .filter(Boolean)
    .join(", ");
  const repeat = repeatStrengthLabel(b.repeat_strength);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-zinc-300">
      {pct != null ? (
        <p>
          <span className="text-zinc-500">{pct}%</span> of the community listened
        </p>
      ) : null}
      <p>
        <span className="tabular-nums text-zinc-200">
          {b.total_plays.toLocaleString()}
        </span>{" "}
        <span className="text-zinc-500">total plays</span>
      </p>
      {repeat ? (
        <p className="text-zinc-400">
          <span className="text-zinc-200">{repeat}</span>
        </p>
      ) : null}
      {ledBy ? (
        <p className="text-zinc-400">
          Led by <span className="text-zinc-200">{ledBy}</span>
        </p>
      ) : null}
    </div>
  );
}

function CommunityBreakdownPanel({ row }: { row: WeeklyChartRankingApiRow }) {
  const b = row.community_breakdown;
  const prominent = row.is_number_one;
  const [open, setOpen] = useState(prominent);

  if (!b) return null;

  return (
    <div
      className={`hidden border-t border-zinc-800/80 md:block ${prominent ? "bg-emerald-950/10" : "bg-zinc-950/35"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
      >
        <span>
          {prominent ? (
            <span className="font-semibold text-emerald-400/95">
              Why is this ranked?
            </span>
          ) : (
            "Why is this ranked?"
          )}
        </span>
        <span
          className={`inline-block text-zinc-600 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▼
        </span>
      </button>
      {open ? (
        <div className="px-3 pb-3.5">
          <CommunityBreakdownBody row={row} />
        </div>
      ) : null}
    </div>
  );
}

/** Mobile community rows: plays, streak, contributors + optional RPC breakdown. */
function CommunityMobileRowDetails({ row }: { row: WeeklyChartRankingApiRow }) {
  const ledByInline = row.top_contributors
    ?.map((c) => c.username?.trim() || "Member")
    .filter(Boolean)
    .join(", ");

  return (
    <details className="border-t border-zinc-800/80 bg-zinc-950/35 md:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-zinc-500 marker:hidden [&::-webkit-details-marker]:hidden hover:text-zinc-300">
        <span>Plays, streak &amp; more</span>
        <span className="shrink-0 text-zinc-600" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="space-y-3 border-t border-zinc-800/50 px-3 pb-3.5 pt-3 text-sm leading-relaxed text-zinc-300">
        <p>
          <span className="tabular-nums text-zinc-200">
            {row.play_count.toLocaleString()}
          </span>{" "}
          <span className="text-zinc-500">plays this week</span>
        </p>
        <p className="text-xs tabular-nums text-zinc-500">
          <span className="text-zinc-600">Weeks in top 10 · at #1 (all-time) </span>
          <span className="text-zinc-400">
            {row.weeks_in_top_10} ({row.weeks_at_1})
          </span>
        </p>
        {row.community_listen_percent != null &&
        row.unique_listeners != null ? (
          <p className="text-xs text-zinc-500">
            {Math.round(row.community_listen_percent * 100)}% of community
            listened
          </p>
        ) : null}
        {ledByInline ? (
          <p className="text-xs text-zinc-500">
            Led by <span className="text-zinc-300">{ledByInline}</span>
          </p>
        ) : null}
        {row.community_breakdown ? (
          <div className="border-t border-zinc-800/60 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Why this ranked
            </p>
            <CommunityBreakdownBody row={row} />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function MovementIndicator({ row }: { row: WeeklyChartRankingApiRow }) {
  if (row.is_new) {
    return (
      <span className="inline-flex items-center rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-sky-500/30">
        New
      </span>
    );
  }
  if (row.is_reentry) {
    return (
      <span className="inline-flex items-center rounded-md bg-violet-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-violet-500/30">
        Re
      </span>
    );
  }
  if (row.movement == null || row.movement === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
        <span className="text-zinc-600" aria-hidden>
          —
        </span>
        <span className="sr-only">No change</span>
      </span>
    );
  }
  if (row.movement > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-400">
        <span aria-hidden>▲</span>
        {row.movement}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-400">
      <span aria-hidden>▼</span>
      {Math.abs(row.movement)}
    </span>
  );
}

const ChartRow = memo(function ChartRow({
  row,
  communityMode = false,
}: {
  row: WeeklyChartRankingApiRow;
  communityMode?: boolean;
}) {
  const rankMuted = row.rank > 3;
  const rowAnim = communityMode ? communityMovementRowClass(row) : "";
  const leaderShell =
    communityMode && row.is_number_one
      ? "ring-1 ring-emerald-500/25 shadow-md shadow-emerald-950/20"
      : "";

  const movementNode = communityMode ? (
    <CommunityRankMovementIndicator row={row} />
  ) : (
    <MovementIndicator row={row} />
  );

  const metaSecondary = (
    <>
      <span className="text-xs tabular-nums text-zinc-500">
        {row.play_count.toLocaleString()} plays
      </span>
      <span className="text-xs tabular-nums text-zinc-500">
        <span className="text-zinc-600">
          {communityMode ? "weeks in top 10 " : "streak "}
        </span>
        <span className="text-zinc-400">
          {row.weeks_in_top_10} ({row.weeks_at_1})
        </span>
      </span>
      {communityMode && !row.community_breakdown ? (
        <>
          {row.community_listen_percent != null &&
          row.unique_listeners != null ? (
            <span className="text-xs text-zinc-500">
              {Math.round(row.community_listen_percent * 100)}% of community
              listened
            </span>
          ) : null}
          {row.top_contributors?.length ? (
            <span className="max-w-[14rem] text-right text-xs leading-snug text-zinc-500">
              Led by{" "}
              {row.top_contributors
                .map((c) => c.username?.trim() || "Member")
                .join(", ")}
            </span>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <li>
      <div
        className={`overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/30 transition-all duration-150 hover:border-zinc-700/90 hover:bg-zinc-900/55 ${
          row.has_positive_movement
            ? "border-l-2 border-l-emerald-500/35"
            : ""
        } ${
          row.has_negative_movement ? "border-l-2 border-l-rose-500/30" : ""
        } ${rowAnim} ${leaderShell}`}
      >
        <div
          className={`flex p-3 sm:p-4 ${
            communityMode
              ? "max-md:min-h-16 max-md:flex-row max-md:items-center max-md:gap-3 max-md:py-2.5 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
              : "flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
          }`}
        >
          <div
            className={`shrink-0 tabular-nums font-bold leading-none tracking-tight sm:w-14 sm:text-center ${
              communityMode
                ? "max-md:w-9 max-md:text-center max-md:text-2xl text-3xl"
                : "text-3xl"
            } ${rankMuted ? "text-zinc-600" : "text-white"}`}
          >
            {row.rank}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image}
                alt=""
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-white/10 sm:h-14 sm:w-14"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs text-zinc-600 sm:h-14 sm:w-14"
              >
                —
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-white">
                {row.name}
              </p>
              {row.artist_name ? (
                <p className="truncate text-sm text-zinc-500">
                  {row.artist_name}
                </p>
              ) : null}
            </div>
          </div>
          <div
            className={
              communityMode
                ? "flex shrink-0 items-center justify-end max-md:min-h-0 max-md:border-t-0 max-md:pt-0 min-h-[4.5rem] flex-row border-t border-zinc-800/80 pt-3 sm:w-[5.5rem] sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0"
                : "flex min-h-[4.5rem] shrink-0 flex-row items-center justify-between gap-4 border-t border-zinc-800/80 pt-3 sm:w-[5.5rem] sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0"
            }
          >
            <div
              className={
                communityMode
                  ? "flex w-full max-md:w-auto flex-col items-stretch gap-1 max-md:items-end max-md:gap-0 sm:w-auto sm:items-end sm:text-right"
                  : "flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end sm:text-right"
              }
            >
              <div className="flex min-h-[1.25rem] items-center max-md:min-h-[1.5rem] justify-end">
                {movementNode}
              </div>
              <div
                className={
                  communityMode
                    ? "hidden flex-col items-end gap-1 text-right md:flex"
                    : "flex flex-col items-end gap-1 text-right"
                }
              >
                {metaSecondary}
              </div>
            </div>
          </div>
        </div>
        {communityMode ? <CommunityMobileRowDetails row={row} /> : null}
        {communityMode && row.community_breakdown ? (
          <CommunityBreakdownPanel row={row} />
        ) : null}
      </div>
    </li>
  );
});

type MoverStripRow =
  | WeeklyChartRankingApiRow
  | HydratedWeeklyChartDropout
  | null;

function moverMovementNode(row: MoverStripRow) {
  if (!row) return null;
  if ("kind" in row && row.kind === "dropout") {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-rose-400">
        <span aria-hidden>▼</span>
        {Math.abs(row.movement)}
      </span>
    );
  }
  const r = row as WeeklyChartRankingApiRow;
  if (r.rank_movement === "NEW") {
    return (
      <span className="mt-2 inline-flex rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-sky-500/30">
        NEW
      </span>
    );
  }
  if (r.rank_movement === "UP" && r.rank_delta != null && r.rank_delta > 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 tabular-nums">
        <span aria-hidden>▲</span>
        +{r.rank_delta}
      </span>
    );
  }
  if (r.rank_movement === "DOWN" && r.rank_delta != null && r.rank_delta > 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-rose-400 tabular-nums">
        <span aria-hidden>▼</span>
        −{r.rank_delta}
      </span>
    );
  }
  if (r.rank_movement === "SAME") {
    return <span className="mt-2 text-sm text-zinc-500">—</span>;
  }
  if (r.rank_movement == null && r.is_new) {
    return (
      <span className="mt-2 inline-flex rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
        New
      </span>
    );
  }
  if (r.movement == null || r.movement === 0) {
    return <span className="mt-2 text-sm text-zinc-500">—</span>;
  }
  if (r.movement > 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-400">
        <span aria-hidden>▲</span>
        {r.movement}
      </span>
    );
  }
  return (
    <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-rose-400">
      <span aria-hidden>▼</span>
      {Math.abs(r.movement)}
    </span>
  );
}

const MoversGrid = memo(function MoversGrid({
  movers,
}: {
  movers: WeeklyChartMoversApi;
}) {
  const items: { label: string; row: MoverStripRow }[] = [
    { label: "Biggest jump", row: movers.biggest_jump },
    { label: "Biggest drop", row: movers.biggest_drop },
    { label: "Best new entry", row: movers.best_new_entry },
  ];
  const any = items.some((i) => i.row);
  if (!any) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map(({ label, row }) => (
        <div
          key={label}
          className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-4 shadow-lg shadow-black/20 transition duration-150 hover:border-zinc-700/80 hover:bg-zinc-900/70"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            {label}
          </p>
          {row ? (
            <>
              <p className="mt-2 line-clamp-2 text-base font-semibold text-white">
                {row.name}
              </p>
              {"kind" in row && row.kind === "dropout" ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Was #{row.prev_rank} · left the chart
                </p>
              ) : null}
              {moverMovementNode(row)}
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">—</p>
          )}
        </div>
      ))}
    </div>
  );
});

function BillboardHeroStatBlocks({ leader }: { leader: WeeklyChartRankingApiRow }) {
  return (
    <>
      <div className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5">
        <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
          Plays
        </dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">
          {leader.play_count.toLocaleString()}
        </dd>
      </div>
      <div className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5">
        <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
          Weeks at #1 (all-time)
        </dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
          {leader.weeks_at_1}
        </dd>
      </div>
      <div className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5">
        <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
          Top 10 · at #1 (all-time)
        </dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
          {leader.weeks_in_top_10} ({leader.weeks_at_1})
        </dd>
      </div>
    </>
  );
}

type HeroProps = {
  leader: WeeklyChartRankingApiRow;
  weekLabel: string;
  chartKind: string;
  communityMode?: boolean;
};

const BillboardHero = memo(function BillboardHero({
  leader,
  weekLabel,
  chartKind,
  communityMode = false,
}: HeroProps) {
  const entityLabel =
    chartKind === "Artists"
      ? "Artist"
      : chartKind === "Albums"
        ? "Album"
        : "Track";
  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 shadow-2xl shadow-black/50 ring-1 ring-white/5 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl" />
      <p className="relative text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        {weekLabel}
      </p>
      <div className="relative mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
        <div className="flex items-center justify-center sm:scale-105">
          {leader.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={leader.image}
              alt=""
              className="h-40 w-40 rounded-xl object-cover shadow-xl ring-1 ring-white/10 sm:h-44 sm:w-44"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-xl bg-zinc-800 text-sm text-zinc-600 ring-1 ring-white/5 sm:h-44 sm:w-44">
              —
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200/90 ring-1 ring-amber-500/25">
            {communityMode ? "#1" : "#1 this week"}
          </p>
          <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
            {leader.name}
          </h2>
          {leader.artist_name ? (
            <p className="mt-2 text-sm text-zinc-400 sm:text-base">
              {leader.artist_name}
            </p>
          ) : chartKind === "Artists" ? (
            <p className="mt-2 text-sm text-zinc-500">
              {communityMode ? "Top artist" : "Top artist this week"}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">{entityLabel}</p>
          )}
          {communityMode ? (
            <>
              <dl className="mt-6 hidden grid-cols-1 gap-3 text-sm sm:grid-cols-3 md:grid">
                <BillboardHeroStatBlocks leader={leader} />
              </dl>
              <details className="mt-4 rounded-xl border border-zinc-800/80 bg-black/15 ring-1 ring-white/[0.04] md:hidden">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-zinc-500 marker:hidden [&::-webkit-details-marker]:hidden hover:text-zinc-300">
                  #1 · plays &amp; streaks
                </summary>
                <dl className="grid grid-cols-1 gap-2 border-t border-zinc-800/60 px-3 py-3 text-sm sm:grid-cols-3">
                  <BillboardHeroStatBlocks leader={leader} />
                </dl>
              </details>
            </>
          ) : (
            <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <BillboardHeroStatBlocks leader={leader} />
            </dl>
          )}
        </div>
      </div>
    </section>
  );
});

type NarrativeProps = { lines: string[]; eyebrow?: string };

const NarrativeCard = memo(function NarrativeCard({
  lines,
  eyebrow = "This week",
}: NarrativeProps) {
  if (lines.length === 0) return null;
  const icons = ["✦", "◆", "◇", "✧"];
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/25 p-5 shadow-inner shadow-black/20 sm:p-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {eyebrow}
      </h3>
      <ul className="mt-4 space-y-4">
        {lines.map((line, i) => (
          <li
            key={`${line}-${i}`}
            className="flex gap-3 text-base leading-relaxed text-zinc-200 sm:text-lg"
          >
            <span className="text-lg opacity-80" aria-hidden>
              {icons[i % icons.length]}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});

export function WeeklyBillboardView(props: {
  chartKind: string;
  chartType: ChartType;
  weekLabel: string;
  /** ISO `week_start` from API for share-image URL. */
  weekStartIso: string;
  rankings: WeeklyChartRankingApiRow[];
  movers: WeeklyChartMoversApi;
  narrative: string[];
  chart_moment: ChartMomentPayload;
  /** When set, share PNG uses `/api/communities/[id]/charts/share-image`. */
  communityId?: string | null;
  /** Community API: ISO time of next Sunday UTC drop. */
  nextChartDropIso?: string | null;
  /** Community: members with ≥1 listen in the chart window. */
  communityActiveListeners?: number | null;
  /** Community: viewer had ≥1 play during the chart week. */
  viewerContributed?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const canShare =
    props.chart_moment.top_5.length > 0 || props.chart_moment.number_one != null;
  const isCommunity = Boolean(props.communityId?.trim());

  const leader = useMemo(() => {
    const byRank = [...props.rankings].sort((a, b) => a.rank - b.rank);
    return byRank[0] ?? null;
  }, [props.rankings]);

  const chartRowsRest = useMemo(() => {
    return [...props.rankings]
      .filter((r) => r.rank > 1)
      .sort((a, b) => a.rank - b.rank);
  }, [props.rankings]);

  const chartRowsMobileTop = useMemo(
    () => chartRowsRest.filter((r) => r.rank <= 5),
    [chartRowsRest],
  );
  const chartRowsMobileRest = useMemo(
    () => chartRowsRest.filter((r) => r.rank > 5),
    [chartRowsRest],
  );

  if (props.rankings.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
        <p className="text-base text-zinc-400">
          No chart rows for this week yet.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-10 sm:space-y-12">
      {isCommunity &&
      (props.communityActiveListeners != null || props.viewerContributed) ? (
        <header className="space-y-2">
          {props.communityActiveListeners != null ? (
            <p className="text-sm text-zinc-400">
              Based on {props.communityActiveListeners.toLocaleString()}{" "}
              listeners this week
            </p>
          ) : null}
          {props.viewerContributed ? (
            <p className="text-sm font-medium text-emerald-400/95">
              You helped shape this chart
            </p>
          ) : null}
        </header>
      ) : null}

      {isCommunity && props.nextChartDropIso ? (
        <CommunityChartDropCountdown dropIso={props.nextChartDropIso} />
      ) : null}

      {leader ? (
        <BillboardHero
          leader={leader}
          weekLabel={props.weekLabel}
          chartKind={props.chartKind}
          communityMode={isCommunity}
        />
      ) : null}

      <NarrativeCard
        lines={props.narrative}
        eyebrow={isCommunity ? "Community" : "This week"}
      />

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          {isCommunity ? (
            <>
              <span className="md:hidden">Spots 2–5</span>
              <span className="hidden md:inline">Spots 2–10</span>
            </>
          ) : (
            "Spots 2–10"
          )}
        </h3>
        {isCommunity ? (
          <>
            <ol className="mt-4 space-y-3 md:hidden">
              {chartRowsMobileTop.map((row) => (
                <ChartRow
                  key={`${props.weekStartIso}-${row.entity_id}`}
                  row={row}
                  communityMode
                />
              ))}
            </ol>
            {chartRowsMobileRest.length > 0 ? (
              <details className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/25 ring-1 ring-white/[0.04] md:hidden">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-400 marker:hidden [&::-webkit-details-marker]:hidden hover:text-zinc-200">
                  Show spots 6–10
                </summary>
                <ol className="space-y-3 border-t border-zinc-800/60 p-3 pt-4">
                  {chartRowsMobileRest.map((row) => (
                    <ChartRow
                      key={`${props.weekStartIso}-${row.entity_id}-more`}
                      row={row}
                      communityMode
                    />
                  ))}
                </ol>
              </details>
            ) : null}
            <ol className="mt-4 hidden space-y-3 md:block">
              {chartRowsRest.map((row) => (
                <ChartRow
                  key={`${props.weekStartIso}-${row.entity_id}`}
                  row={row}
                  communityMode
                />
              ))}
            </ol>
          </>
        ) : (
          <ol className="mt-4 space-y-3">
            {chartRowsRest.map((row) => (
              <ChartRow
                key={`${props.weekStartIso}-${row.entity_id}`}
                row={row}
                communityMode={false}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Biggest movers
        </h3>
        <MoversGrid movers={props.movers} />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 sm:p-8">
        <h3 className="text-lg font-semibold text-white">
          {isCommunity ? "Share chart" : "Share this week"}
        </h3>
        <p className="mt-2 max-w-xl text-sm text-zinc-500">
          {isCommunity
            ? "Export a summary or image. Members need to be signed in to open community chart links."
            : "Export a summary or link. Anyone with the link needs to be signed in to open your chart."}
        </p>
        <div className="mt-6 flex flex-col gap-6">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500 sm:w-auto sm:self-start sm:px-10 sm:py-4"
          >
            {isCommunity ? "Share community chart" : "Share your chart"}
          </button>
          <div className="border-t border-zinc-800/80 pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Quick actions
            </p>
            <div className="mt-3">
              <ChartShareActions
                chartKind={props.chartKind}
                chart_moment={props.chart_moment}
                disableFormattedShare={!canShare}
                layout="inline"
              />
            </div>
          </div>
        </div>
      </section>

      <ChartShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        chartKind={props.chartKind}
        chartType={props.chartType}
        weekStartIso={props.weekStartIso}
        chart_moment={props.chart_moment}
        disableFormattedShare={!canShare}
        communityId={props.communityId}
        shareTitle={isCommunity ? "Share community chart" : undefined}
      />
    </div>
  );
}
