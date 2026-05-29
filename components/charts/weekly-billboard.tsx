"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { ChartShareModal } from "@/components/charts/chart-share-modal";
import { CommunityChartDropCountdown } from "@/components/community/community-chart-drop-countdown";
import type { WeeklyChartMoversApi } from "@/lib/charts/get-user-weekly-chart";
import type { HydratedWeeklyChartDropout } from "@/lib/charts/hydrate-weekly-chart";
import { isUnknownWeeklyChartEntityId } from "@/lib/charts/weekly-chart-entity-guards";
import type {
  ChartMomentPayload,
  ChartType,
  WeeklyChartRankingApiRow,
} from "@/lib/charts/weekly-chart-types";
import {
  cardPaddingCompact,
  cardRadius,
  chartMoverCard,
  chartRankingRowShell,
} from "@/lib/ui/surface";

function catalogHrefForChartEntity(
  chartType: ChartType,
  entityId: string,
): string {
  if (chartType === "tracks") return `/song/${encodeURIComponent(entityId)}`;
  if (chartType === "artists") return `/artist/${encodeURIComponent(entityId)}`;
  return `/album/${encodeURIComponent(entityId)}`;
}

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
        <span className="inline-flex items-center rounded-md bg-blue-950 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
          NEW
        </span>
      );
    }
    if (rm === "UP" && row.rank_delta != null && row.rank_delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-gold-400/95 tabular-nums">
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
      className={`hidden border-t border-zinc-800/80 md:block ${prominent ? "bg-gold-950/10" : "bg-zinc-950/35"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
      >
        <span>
          {prominent ? (
            <span className="font-semibold text-gold-400/95">
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
        <span>Plays, streak & more</span>
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
      <span className="inline-flex items-center rounded-md bg-blue-950 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
        NEW
      </span>
    );
  }
  if (row.is_reentry) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-gold-400" title="Re-entry">
        <span aria-hidden>▲</span>
      </span>
    );
  }
  if (row.movement == null || row.movement === 0) {
    return (
      <span className="text-sm text-zinc-600" aria-hidden>—</span>
    );
  }
  if (row.movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-gold-400">
        <span aria-hidden>▲</span>{row.movement}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-sm font-bold text-rose-400">
      <span aria-hidden>▼</span>{Math.abs(row.movement)}
    </span>
  );
}

const ChartRow = memo(function ChartRow({
  row,
  communityMode = false,
  chartType,
}: {
  row: WeeklyChartRankingApiRow;
  communityMode?: boolean;
  /** When set with community mode, links image + title to catalog (track / artist / album). */
  chartType?: ChartType;
}) {
  const rankMuted = row.rank > 3;
  const rowAnim = communityMode ? communityMovementRowClass(row) : "";
  const leaderShell =
    communityMode && row.is_number_one
      ? "ring-1 ring-gold-500/25 shadow-md shadow-gold-950/20"
      : "";

  const catalogHref =
    communityMode &&
    chartType &&
    !isUnknownWeeklyChartEntityId(row.entity_id)
      ? catalogHrefForChartEntity(chartType, row.entity_id)
      : null;

  const movementNode = communityMode ? (
    <CommunityRankMovementIndicator row={row} />
  ) : (
    <MovementIndicator row={row} />
  );

  const metaSecondary = communityMode ? (
    // Community mode: clean stats matching mobile (plays + listeners)
    <>
      <span className="text-xs tabular-nums text-zinc-500">
        {row.play_count.toLocaleString()} plays
      </span>
      {row.unique_listeners != null && (
        <span className="text-xs tabular-nums text-zinc-500">
          {row.unique_listeners} {row.unique_listeners === 1 ? "listener" : "listeners"}
        </span>
      )}
    </>
  ) : (
    <>
      <span className="text-xs tabular-nums text-zinc-500">
        {row.play_count.toLocaleString()} plays
      </span>
      <span className="text-xs tabular-nums text-zinc-500">
        <span className="text-zinc-600">streak </span>
        <span className="text-zinc-400">
          {row.weeks_in_top_10} ({row.weeks_at_1})
        </span>
      </span>
    </>
  );

  const imageEl = row.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.image}
      alt=""
      loading="lazy"
      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
    />
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-600">
      —
    </div>
  );

  return (
    <li>
      <div className={`${chartRankingRowShell} ${rowAnim} ${leaderShell}`}>
        <div className={`flex items-center gap-3 ${cardPaddingCompact}`}>
          {/* Rank */}
          <div className={`w-10 shrink-0 text-center text-4xl font-bold tabular-nums leading-none tracking-tight ${rankMuted ? "text-zinc-600" : "text-white"}`}>
            {row.rank}
          </div>

          {/* Art + name */}
          {catalogHref ? (
            <Link href={catalogHref} prefetch={false} className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-gold-500/45">
              {imageEl}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white group-hover:text-gold-200/95 group-hover:underline">{row.name}</p>
                {row.artist_name ? <p className="truncate text-sm text-zinc-400">{row.artist_name}</p> : null}
              </div>
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {imageEl}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{row.name}</p>
                {row.artist_name ? <p className="truncate text-sm text-zinc-400">{row.artist_name}</p> : null}
              </div>
            </div>
          )}

          {/* Movement + stats */}
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <div className="flex min-h-5 items-center justify-end">{movementNode}</div>
            {metaSecondary}
          </div>
        </div>
        {communityMode ? <CommunityMobileRowDetails row={row} /> : null}
        {communityMode && row.community_breakdown ? <CommunityBreakdownPanel row={row} /> : null}
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
      <span className="mt-2 inline-flex rounded-md bg-blue-950 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
        NEW
      </span>
    );
  }
  if (r.rank_movement === "UP" && r.rank_delta != null && r.rank_delta > 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gold-400 tabular-nums">
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
      <span className="mt-2 inline-flex rounded-md bg-blue-950 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
        NEW
      </span>
    );
  }
  if (r.movement == null || r.movement === 0) {
    return <span className="mt-2 text-sm text-zinc-500">—</span>;
  }
  if (r.movement > 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gold-400">
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
  chartType,
  linkEntities = false,
}: {
  movers: WeeklyChartMoversApi;
  chartType: ChartType;
  /** Community billboard: link mover titles to catalog. */
  linkEntities?: boolean;
}) {
  const items: { label: string; row: MoverStripRow }[] = [
    { label: "Biggest jump", row: movers.biggest_jump },
    { label: "Biggest drop", row: movers.biggest_drop },
    { label: "Best new entry", row: movers.best_new_entry },
  ];
  const any = items.some((i) => i.row);
  if (!any) return null;
  function moverHref(r: MoverStripRow): string | null {
    if (!linkEntities) return null;
    const id =
      r && "kind" in r && r.kind === "dropout"
        ? r.entity_id
        : r
          ? (r as WeeklyChartRankingApiRow).entity_id
          : null;
    if (!id || isUnknownWeeklyChartEntityId(id)) return null;
    return catalogHrefForChartEntity(chartType, id);
  }

  return (
    <div className="space-y-4">
      {items.map(({ label, row }) => {
        const href = row ? moverHref(row) : null;
        if (!row) return null;
        return (
          <div key={label} className={`${chartMoverCard} shadow-lg shadow-black/25`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              {label}
            </p>
            <div className="mt-2">
              {href ? (
                <Link
                  href={href}
                  prefetch={false}
                  className="block text-xl font-bold leading-tight text-white transition hover:text-gold-200/95 hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                <p className="text-xl font-bold leading-tight text-white">
                  {row.name}
                </p>
              )}
              {"kind" in row && row.kind === "dropout" ? (
                <p className="mt-1 text-sm text-zinc-500">
                  Was #{row.prev_rank} · left the chart
                </p>
              ) : (row as WeeklyChartRankingApiRow).is_new ? (
                <p className="mt-1 text-sm text-zinc-500">New</p>
              ) : null}
            </div>
            {moverMovementNode(row)}
          </div>
        );
      })}
    </div>
  );
});

function BillboardHeroStatBlocks({
  leader,
  communityMode = false,
}: {
  leader: WeeklyChartRankingApiRow;
  communityMode?: boolean;
}) {
  if (communityMode) {
    const pct =
      leader.community_listen_percent != null
        ? Math.round(leader.community_listen_percent * 100)
        : null;
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
        {leader.unique_listeners != null && (
          <div className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
              Listeners
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
              {leader.unique_listeners.toLocaleString()}
            </dd>
          </div>
        )}
        {pct != null && (
          <div className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">
              Community
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
              {pct}% listened
            </dd>
          </div>
        )}
      </>
    );
  }
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
  chartType?: ChartType;
};

const BillboardHero = memo(function BillboardHero({
  leader,
  weekLabel,
  chartType,
  communityMode = false,
}: HeroProps) {
  const heroCatalogHref =
    chartType && !isUnknownWeeklyChartEntityId(leader.entity_id)
      ? catalogHrefForChartEntity(chartType, leader.entity_id)
      : null;

  const statsLine = (
    <p className="mt-2 text-xs text-zinc-500 tabular-nums">
      {leader.play_count.toLocaleString()} plays
      {leader.unique_listeners != null
        ? ` · ${leader.unique_listeners} listeners`
        : leader.weeks_at_1 != null
          ? ` · ${leader.weeks_at_1}w at #1 · ${leader.weeks_in_top_10}w in top 10`
          : ""}
    </p>
  );

  const content = (
    <div className="flex items-center gap-5">
      {leader.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={leader.image} alt=""
          className="h-[124px] w-[124px] shrink-0 rounded-xl object-cover ring-2 ring-amber-500/20 shadow-lg shadow-black/40" />
      ) : (
        <div className="flex h-[124px] w-[124px] shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-600">♪</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400/90">#1 this week</p>
        <h2 className="mt-1.5 text-xl font-bold leading-tight tracking-tight text-white line-clamp-2">{leader.name}</h2>
        {leader.artist_name && <p className="mt-0.5 truncate text-sm text-zinc-400">{leader.artist_name}</p>}
        {statsLine}
      </div>
    </div>
  );

  return (
    <section className={`${cardRadius} relative overflow-hidden border border-amber-500/15 bg-zinc-900/60 p-4 shadow-[0_8px_32px_-8px_rgba(200,151,58,0.12)] ring-1 ring-inset ring-white/[0.06]`}>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{weekLabel}</p>
      {heroCatalogHref ? (
        <Link href={heroCatalogHref} prefetch={false} className="group block rounded-xl transition hover:bg-white/[0.03]">
          {content}
        </Link>
      ) : content}
    </section>
  );
});

type NarrativeProps = { lines: string[]; eyebrow?: string };

const NarrativeCard = memo(function NarrativeCard({
  lines,
  eyebrow = "This week",
}: NarrativeProps) {
  if (lines.length === 0) return null;
  const icons = ["✦", "↗", "↑", "·"];
  return (
    <section className={`${cardRadius} border border-zinc-800/80 bg-zinc-900/30 p-5 shadow-inner shadow-black/25 ring-1 ring-inset ring-white/[0.05] sm:p-6`}>
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
  /** Hide the bottom share section (community puts share in the control bar instead). */
  hideShareSection?: boolean;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
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
      <div className={`w-full ${cardRadius} border border-zinc-800/80 bg-zinc-900/40 px-6 py-12 text-center ring-1 ring-inset ring-white/[0.06]`}>
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
        <header className="flex flex-wrap items-center gap-2">
          {props.communityActiveListeners != null ? (
            <span className="inline-flex items-center rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1 text-sm text-zinc-300">
              {props.communityActiveListeners.toLocaleString()} listeners this week
            </span>
          ) : null}
          {props.viewerContributed ? (
            <span className="inline-flex items-center rounded-full border border-gold-500/20 bg-gold-950/50 px-3 py-1 text-sm font-medium text-gold-400/95">
              You contributed
            </span>
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
          chartType={props.chartType}
        />
      ) : null}

      <NarrativeCard
        lines={props.narrative}
        eyebrow={isCommunity ? "Community" : "This week"}
      />

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Spots 2–5
        </h3>
        <ol className="mt-4 space-y-3">
          {chartRowsMobileTop.map((row) => (
            <ChartRow
              key={`${props.weekStartIso}-${row.entity_id}`}
              row={row}
              communityMode={isCommunity}
              chartType={props.chartType}
            />
          ))}
        </ol>
        {chartRowsMobileRest.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="mt-4 w-full py-3 text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              {showMore ? "Hide spots 6–10" : "Show spots 6–10"}
            </button>
            {showMore ? (
              <ol className="mt-1 space-y-3">
                {chartRowsMobileRest.map((row) => (
                  <ChartRow
                    key={`${props.weekStartIso}-${row.entity_id}-more`}
                    row={row}
                    communityMode={isCommunity}
                    chartType={props.chartType}
                  />
                ))}
              </ol>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          Biggest movers
        </h3>
        <MoversGrid
          movers={props.movers}
          chartType={props.chartType}
          linkEntities={isCommunity}
        />
      </section>

      {!props.hideShareSection && (
        <section className={`${cardRadius} border border-zinc-800/80 bg-zinc-950/65 p-6 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] sm:p-8`}>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex w-full items-center justify-center rounded-full bg-gold-500 px-6 py-3.5 text-base font-bold text-black shadow-lg shadow-gold-950/30 transition hover:bg-gold-400"
          >
            {isCommunity ? "Share chart" : "Share this week"}
          </button>
        </section>
      )}

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
