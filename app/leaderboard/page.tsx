"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useLeaderboard } from "@/lib/hooks/use-leaderboard";
import type { LeaderboardFilters } from "@/lib/hooks/use-leaderboard";
import { YearRangeFilter, type YearRange } from "@/components/year-range-filter";

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
        >
          <div className="h-6 w-6 shrink-0 animate-pulse rounded bg-zinc-700" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-700" />
            <div className="h-3 w-32 animate-pulse rounded bg-zinc-700/80" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-700/80" />
          <div className="h-4 w-12 animate-pulse rounded bg-zinc-700/80" />
        </div>
      ))}
    </div>
  );
}

function LeaderboardRow({
  rank,
  id,
  name,
  artist,
  total_plays,
  average_rating,
  favorite_count,
  showFavoriteCount,
}: {
  rank: number;
  id: string;
  name: string;
  artist: string;
  total_plays: number;
  average_rating: number | null;
  favorite_count?: number;
  showFavoriteCount?: boolean;
}) {
  return (
    <Link
      href={`/song/${id}`}
      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <span className="w-6 shrink-0 text-right text-sm font-medium text-zinc-500 tabular-nums">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{name}</p>
        <p className="truncate text-sm text-zinc-500">{artist}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-zinc-400 tabular-nums">
          {total_plays.toLocaleString()} plays
        </span>
        {average_rating != null ? (
          <span className="text-sm text-amber-400">
            ★ {average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-zinc-500">—</span>
        )}
        {showFavoriteCount && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 tabular-nums">
            {(favorite_count ?? 0).toLocaleString()} favorited
          </span>
        )}
      </div>
    </Link>
  );
}

export default function LeaderboardPage() {
  const [type, setType] = useState<"popular" | "topRated" | "mostFavorited">(
    "popular",
  );
  const [yearRange, setYearRange] = useState<YearRange>({});

  const filters: LeaderboardFilters = useMemo(
    () => ({
      startYear: yearRange.startYear,
      endYear: yearRange.endYear,
    }),
    [yearRange.startYear, yearRange.endYear],
  );

  const { data, isLoading, error } = useLeaderboard(type, filters);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mt-1 text-zinc-400">
          Most popular and top rated songs. Adjust filters to change the time period.
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5">
          <button
            type="button"
            onClick={() => setType("popular")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              type === "popular"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Most Popular
          </button>
          <button
            type="button"
            onClick={() => setType("topRated")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              type === "topRated"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Top Rated
          </button>
          <button
            type="button"
            onClick={() => setType("mostFavorited")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              type === "mostFavorited"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Most Favorited
          </button>
        </div>
        <div className="flex items-center gap-3">
          <YearRangeFilter value={yearRange} onChange={setYearRange} />
        </div>
      </div>

      <section className="min-h-[400px]">
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-red-400">
            {error instanceof Error
              ? error.message
              : "Failed to load leaderboard."}
          </div>
        )}

        {!error && isLoading && <LeaderboardSkeleton />}

        {!error && !isLoading && data.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500">No tracks found for this filter.</p>
            <p className="mt-1 text-sm text-zinc-600">
              Try another time period or check back later.
            </p>
          </div>
        )}

        {!error && !isLoading && data.length > 0 && (
          <div className="space-y-2" role="list">
            {data.map((entry, i) => (
              <LeaderboardRow
                key={entry.id}
                rank={i + 1}
                id={entry.id}
                name={entry.name}
                artist={entry.artist}
                total_plays={entry.total_plays}
                average_rating={entry.average_rating}
                favorite_count={entry.favorite_count}
                showFavoriteCount={type === "mostFavorited"}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
