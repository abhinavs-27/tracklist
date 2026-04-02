"use client";

import Link from "next/link";

export type MediaItem = {
  id: string;
  type: "song" | "album";
  title: string;
  artist: string;
  /** Artwork image URL; use empty string or null for placeholder. */
  artworkUrl: string | null;
  avgRating?: number;
  totalPlays?: number;
  /** Optional rank (e.g. leaderboard position); shown as badge when set. */
  rank?: number;
  /** Optional favorite count (e.g. "Most Favorited" leaderboard). */
  favoriteCount?: number;
};

type MediaGridProps = {
  items: MediaItem[];
  /** Optional override for grid columns (default: responsive 2/4/6). */
  columns?: number;
  /**
   * Profile favorite albums (max 4): avoid lg/xl 5–6 column grids that leave empty “slots”.
   * Uses 2 cols on small screens, up to 4 from md+.
   */
  layout?: "default" | "favoriteAlbums";
  /** Optional click handler; if provided, can be used instead of Link navigation. */
  onItemClick?: (item: MediaItem) => void;
};

export function MediaGrid({
  items,
  columns,
  layout = "default",
  onItemClick,
}: MediaGridProps) {
  const useLinks = !onItemClick;

  const gridClass =
    layout === "favoriteAlbums"
      ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
      : columns
        ? "grid gap-3 sm:gap-4"
        : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <ul
      className={gridClass}
      style={
        columns != null && layout !== "favoriteAlbums"
          ? {
              gridTemplateColumns: `repeat(${Math.min(columns, 6)}, minmax(0, 1fr))`,
            }
          : undefined
      }
      role="list"
    >
      {items.map((item) => {
        const href = item.type === "album" ? `/album/${item.id}` : `/song/${item.id}`;
        const content = (
          <>
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-800">
              {item.artworkUrl ? (
                <img
                  src={item.artworkUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-500">
                  ♪
                </div>
              )}
              {item.rank != null && (
                <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-zinc-900/90 text-xs font-medium tabular-nums text-zinc-300">
                  {item.rank}
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-xs font-medium text-white sm:text-sm">
              {item.title}
            </p>
            <p className="truncate text-[11px] text-zinc-500 sm:text-xs">{item.artist}</p>
            {(item.avgRating != null || item.totalPlays != null || item.favoriteCount != null) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-zinc-400">
                {item.avgRating != null && (
                  <span className="text-amber-400">★ {item.avgRating.toFixed(1)}</span>
                )}
                {item.totalPlays != null && (
                  <span>{item.totalPlays.toLocaleString()} plays</span>
                )}
                {item.favoriteCount != null && (
                  <span className="text-emerald-400">
                    {item.favoriteCount.toLocaleString()} favorited
                  </span>
                )}
              </p>
            )}
          </>
        );

        const cardClass =
          "block rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 transition hover:border-emerald-500 hover:bg-zinc-900";

        if (onItemClick) {
          return (
            <li key={`${item.type}-${item.id}`}>
              <button
                type="button"
                onClick={() => onItemClick(item)}
                className={`w-full text-left ${cardClass}`}
              >
                {content}
              </button>
            </li>
          );
        }

        return (
          <li key={`${item.type}-${item.id}`}>
            <Link href={href} className={cardClass}>
              {content}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
