import Link from "next/link";
import type { LeaderboardEntry } from "@/lib/queries";
import { cardElevatedInteractive } from "@/lib/ui/surface";

export function LeaderboardPreview({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500 ring-1 ring-white/[0.06]">
        No leaderboard data yet.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {entries.slice(0, 5).map((entry, i) => {
        const href =
          entry.entity_type === "album" ? `/album/${entry.id}` : `/song/${entry.id}`;
        return (
          <li key={`${entry.id}-${i}`}>
            <Link
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 ${cardElevatedInteractive}`}
            >
              <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-zinc-500">
                {i + 1}
              </span>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                {entry.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.artwork_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500">
                    ♪
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{entry.name}</p>
                <p className="truncate text-xs text-zinc-500">{entry.artist}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {entry.total_plays.toLocaleString()}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
