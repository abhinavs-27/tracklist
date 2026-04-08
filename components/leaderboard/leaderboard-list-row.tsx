import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/hooks/use-leaderboard";
import { cardElevatedInteractive } from "@/lib/ui/surface";

export function LeaderboardListRow({
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
