"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LeaderboardEntry } from "@/lib/hooks/use-leaderboard";
import { MediaGridItem, type MediaItem } from "@/components/media/MediaGrid";
import { LeaderboardListRow } from "@/components/leaderboard/leaderboard-list-row";

const LIST_ROW_ESTIMATE = 108;
const GRID_ROW_ESTIMATE = 260;
const LIST_OVERSCAN = 8;
const GRID_OVERSCAN = 4;

function useLeaderboardGridColumns(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(6);
      else if (w >= 1024) setCols(5);
      else if (w >= 768) setCols(4);
      else if (w >= 640) setCols(3);
      else setCols(2);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return cols;
}

function chunkToRows<T>(items: T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

export function VirtualizedLeaderboardList({
  entries,
  showFavoriteCount,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  entries: LeaderboardEntry[];
  showFavoriteCount: boolean;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  const getItemKey = useCallback(
    (index: number) => entries[index]?.id ?? `lb-${index}`,
    [entries],
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LIST_ROW_ESTIMATE,
    overscan: LIST_OVERSCAN,
    getItemKey,
  });

  useEffect(() => {
    const root = parentRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasNextPage) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void fetchRef.current();
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasNextPage, entries.length]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="max-h-[75vh] overflow-auto"
      role="list"
      aria-busy={isFetchingNextPage}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = entries[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              role="listitem"
              className="pb-3"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <LeaderboardListRow
                rank={virtualRow.index + 1}
                entry={entry}
                showFavoriteCount={showFavoriteCount}
              />
            </div>
          );
        })}
      </div>
      {hasNextPage ? (
        <div
          ref={sentinelRef}
          className="flex min-h-12 items-center justify-center py-4"
          aria-hidden={!isFetchingNextPage}
        >
          {isFetchingNextPage ? (
            <span className="text-sm text-zinc-500" role="status">
              Loading…
            </span>
          ) : (
            <span className="sr-only">Scroll for more</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function VirtualizedLeaderboardGrid({
  items,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  items: MediaItem[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}) {
  const cols = useLeaderboardGridColumns();
  const rowChunks = useMemo(() => chunkToRows(items, cols), [items, cols]);
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  const getItemKey = useCallback(
    (index: number) => {
      const row = rowChunks[index];
      const first = row?.[0];
      return first
        ? `gr-${first.type}-${first.id}-${index}`
        : `gr-${index}`;
    },
    [rowChunks],
  );

  const virtualizer = useVirtualizer({
    count: rowChunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => GRID_ROW_ESTIMATE,
    overscan: GRID_OVERSCAN,
    getItemKey,
  });

  useEffect(() => {
    const root = parentRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasNextPage) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void fetchRef.current();
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasNextPage, rowChunks.length]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="max-h-[75vh] overflow-auto"
      aria-busy={isFetchingNextPage}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rowChunks[virtualRow.index];
          if (!row?.length) return null;
          return (
            <ul
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="grid gap-3 pb-3 sm:gap-4 sm:pb-4"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
              role="list"
            >
              {row.map((item) => (
                <MediaGridItem key={`${item.type}-${item.id}`} item={item} />
              ))}
            </ul>
          );
        })}
      </div>
      {hasNextPage ? (
        <div
          ref={sentinelRef}
          className="flex min-h-12 items-center justify-center py-4"
          aria-hidden={!isFetchingNextPage}
        >
          {isFetchingNextPage ? (
            <span className="text-sm text-zinc-500" role="status">
              Loading…
            </span>
          ) : (
            <span className="sr-only">Scroll for more</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
