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
      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <span className="w-6 shrink-0 text-right text-sm font-medium text-zinc-500 tabular-nums">
        {rank}
      </span>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        {entry.artwork_url ? (
          <img
            src={entry.artwork_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
            ♪
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{entry.name}</p>
        <p className="truncate text-sm text-zinc-500">{entry.artist}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-zinc-400 tabular-nums">
          {entry.total_plays.toLocaleString()} plays
        </span>
        {entry.average_rating != null ? (
          <span className="text-sm text-amber-400">
            ★ {entry.average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-zinc-500">—</span>
        )}
        {showFavoriteCount && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 tabular-nums">
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

  const { data, isLoading, error } = useLeaderboard(type, filters, entity);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="mt-1 text-zinc-400">
          Most popular and top rated {entity === "album" ? "albums" : "songs"}. Adjust filters to change the time period.
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
            {getChartConfig("popular")?.label ?? "Most Popular"}
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
            {getChartConfig("top_rated")?.label ?? "Top Rated"}
          </button>
          {/* Only allow "Most Favorited" when viewing albums, since only albums can be favorited. */}
          {entity === "album" && (
            <button
              type="button"
              onClick={() => setType("mostFavorited")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                type === "mostFavorited"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {getChartConfig("favorited")?.label ?? "Most Favorited"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setEntity("song");
                // If we were on "Most Favorited" (albums-only), switch back to a valid type.
                if (type === "mostFavorited") setType("popular");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                entity === "song"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Songs
            </button>
            <button
              type="button"
              onClick={() => setEntity("album")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                entity === "album"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Albums
            </button>
          </div>
          <YearRangeFilter value={yearRange} onChange={setYearRange} />
          <div
            className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5"
            role="group"
            aria-label="View"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded-md p-2 transition ${
                view === "grid"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Grid view"
              aria-pressed={view === "grid"}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-md p-2 transition ${
                view === "list"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
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
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-red-400">
            {error instanceof Error
              ? error.message
              : "Failed to load leaderboard."}
          </div>
        )}

        {!error && isLoading && <LeaderboardSkeleton />}

        {!error && !isLoading && data.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500">
              No {entity === "album" ? "albums" : "tracks"} found for this filter.
            </p>
            <p className="mt-1 text-sm text-zinc-600">
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
                ...(type === "mostFavorited" &&
                  entry.favorite_count != null && {
                    favoriteCount: entry.favorite_count,
                  }),
              }),
            )}
          />
        )}

        {!error && !isLoading && data.length > 0 && view === "list" && (
          <div className="space-y-2" role="list">
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
