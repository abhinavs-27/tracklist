"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useLeaderboard,
  type LeaderboardEntry,
  type LeaderboardFilters,
} from "@/lib/hooks/use-leaderboard";
import { YearRangeFilter, type YearRange } from "@/components/year-range-filter";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import {
  cardElevated,
  cardElevatedInteractive,
  pageSubtitle,
  pageTitle,
  segmentedButtonActive,
  segmentedButtonIdle,
  segmentedShell,
  sectionGap,
} from "@/lib/ui/surface";

function LeaderboardListRow({
  rank,
  entry,
  showFavoriteCount,
}: {
  rank: number;
  entry: LeaderboardEntry;
  showFavoriteCount: boolean;
}) {
  const href =
    entry.entity_type === "album" ? `/album/${entry.id}` : `/song/${entry.id}`;
  return (
    <Link
      href={href}
      className={`flex flex-col gap-2 p-4 touch-manipulation sm:flex-row sm:items-center sm:gap-3 ${cardElevatedInteractive}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <span className="w-6 shrink-0 text-right text-sm font-medium text-zinc-500 tabular-nums">
          {rank}
        </span>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800 sm:h-12 sm:w-12">
          {entry.artwork_url ? (
            <img
              src={entry.artwork_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base text-zinc-500 sm:text-lg">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white sm:text-base">
            {entry.name}
          </p>
          <p className="truncate text-xs text-zinc-500 sm:text-sm">{entry.artist}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-zinc-400 tabular-nums shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)] sm:pt-0 sm:shadow-none sm:text-sm sm:shrink-0">
        <span>{entry.total_plays.toLocaleString()} plays</span>
        {entry.average_rating != null ? (
          <span className="text-amber-400">
            ★ {entry.average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
        {showFavoriteCount && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 tabular-nums sm:text-xs">
            {(entry.favorite_count ?? 0).toLocaleString()} favorited
          </span>
        )}
      </div>
    </Link>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-3 ${cardElevated} ${i >= 5 ? "max-sm:hidden" : ""}`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="h-6 w-6 shrink-0 animate-pulse rounded bg-zinc-700" />
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-zinc-700 sm:h-12 sm:w-12" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="h-4 max-w-[12rem] animate-pulse rounded-md bg-zinc-700" />
              <div className="h-3 max-w-[8rem] animate-pulse rounded-md bg-zinc-700/80" />
            </div>
          </div>
          <div className="flex gap-3 pt-2 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)] sm:pt-0 sm:shadow-none">
            <div className="h-4 w-16 animate-pulse rounded-md bg-zinc-700/80" />
            <div className="h-4 w-12 animate-pulse rounded-md bg-zinc-700/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeaderboardPage() {
  const [type, setType] = useState<"popular" | "topRated" | "mostFavorited">(
    "popular",
  );
  const [entity, setEntity] = useState<"song" | "album">("song");
  const [yearRange, setYearRange] = useState<YearRange>({});
  const [view, setView] = useState<"grid" | "list">("grid");

  const filters: LeaderboardFilters = useMemo(
    () => ({
      startYear: yearRange.startYear,
      endYear: yearRange.endYear,
    }),
    [yearRange.startYear, yearRange.endYear],
  );

  const { data, isLoading, isPending, error } = useLeaderboard(
    type,
    filters,
    entity,
  );

  return (
    <div className={sectionGap}>
      <header>
        <Link
          href="/explore"
          className="text-sm font-medium text-zinc-500 transition hover:text-emerald-400"
        >
          ← Explore
        </Link>
        <h1 className={`${pageTitle} mt-3`}>Leaderboard</h1>
        <p className={pageSubtitle}>
          Most popular and top rated {entity === "album" ? "albums" : "songs"}.
          Adjust filters to change the time period.
        </p>
      </header>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className={`flex w-full min-w-0 flex-wrap sm:w-auto ${segmentedShell}`}>
          <button
            type="button"
            onClick={() => setType("popular")}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
              type === "popular" ? segmentedButtonActive : segmentedButtonIdle
            }`}
          >
            {getChartConfig("popular")?.label ?? "Most Popular"}
          </button>
          <button
            type="button"
            onClick={() => setType("topRated")}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
              type === "topRated" ? segmentedButtonActive : segmentedButtonIdle
            }`}
          >
            {getChartConfig("top_rated")?.label ?? "Top Rated"}
          </button>
          {/* Only allow "Most Favorited" when viewing albums, since only albums can be favorited. */}
          {entity === "album" && (
            <button
              type="button"
              onClick={() => setType("mostFavorited")}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
                type === "mostFavorited"
                  ? segmentedButtonActive
                  : segmentedButtonIdle
              }`}
            >
              {getChartConfig("favorited")?.label ?? "Most Favorited"}
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className={`flex ${segmentedShell}`}>
            <button
              type="button"
              onClick={() => {
                setEntity("song");
                // If we were on "Most Favorited" (albums-only), switch back to a valid type.
                if (type === "mostFavorited") setType("popular");
              }}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:py-1.5 ${
                entity === "song" ? segmentedButtonActive : segmentedButtonIdle
              }`}
            >
              Songs
            </button>
            <button
              type="button"
              onClick={() => setEntity("album")}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:py-1.5 ${
                entity === "album" ? segmentedButtonActive : segmentedButtonIdle
              }`}
            >
              Albums
            </button>
          </div>
          <YearRangeFilter value={yearRange} onChange={setYearRange} />
          <div
            className={`flex shrink-0 ${segmentedShell}`}
            role="group"
            aria-label="View"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 transition ${
                view === "grid" ? segmentedButtonActive : segmentedButtonIdle
              }`}
              title="Grid view"
              aria-pressed={view === "grid"}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 transition ${
                view === "list" ? segmentedButtonActive : segmentedButtonIdle
              }`}
              title="List view"
              aria-pressed={view === "list"}
            >
              <ListIcon />
            </button>
          </div>
        </div>
      </div>

      <section className="min-h-[400px]">
        {error && (
          <div className="rounded-2xl bg-red-950/25 p-5 text-red-300 ring-1 ring-inset ring-red-500/20">
            {error instanceof Error
              ? error.message
              : "Failed to load leaderboard."}
          </div>
        )}

        {!error && isPending && data.length === 0 && <LeaderboardSkeleton />}

        {!error && !isLoading && data.length === 0 && (
          <div className={`p-10 text-center sm:p-12 ${cardElevated}`}>
            <p className="text-base text-zinc-400">
              No {entity === "album" ? "albums" : "tracks"} found for this filter.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Try another time period or check back later.
            </p>
          </div>
        )}

        {!error && !isLoading && data.length > 0 && view === "grid" && (
          <MediaGrid
            items={data.map(
              (entry, i): MediaItem => ({
                id: entry.id,
                type: entry.entity_type,
                title: entry.name,
                artist: entry.artist,
                artworkUrl: entry.artwork_url ?? null,
                avgRating: entry.average_rating ?? undefined,
                totalPlays: entry.total_plays,
                rank: i + 1,
                ...(type === "mostFavorited" && {
                  favoriteCount: entry.favorite_count ?? 0,
                }),
              }),
            )}
          />
        )}

        {!error && !isLoading && data.length > 0 && view === "list" && (
          <div className="space-y-3" role="list">
            {data.map((entry, i) => (
              <LeaderboardListRow
                key={entry.id}
                rank={i + 1}
                entry={entry}
                showFavoriteCount={type === "mostFavorited"}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
