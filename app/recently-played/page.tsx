"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const PAGE_SIZE = 20;
const ROW_ESTIMATE = 76;
const ROW_OVERSCAN = 10;

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

type ApiResponse = { items: RecentTrack[]; hasMore: boolean };

export default function RecentlyPlayedPage() {
  const [items, setItems] = useState<RecentTrack[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    const setLoadingState = append ? setLoadingMore : setLoading;
    setLoadingState(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/recently-played?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Couldn’t load recent plays");
      const data = (await res.json()) as ApiResponse;
      setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load recent plays");
      if (!append) setItems([]);
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(() => {
    if (loadingMore || !hasMore) return;
    fetchPage(items.length, true);
  });

  const itemsLenRef = useRef(items.length);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  itemsLenRef.current = items.length;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;

  fetchRef.current = () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    void fetchPage(itemsLenRef.current, true);
  };

  const getItemKey = useCallback(
    (index: number) =>
      `${items[index]?.track_id ?? "t"}-${items[index]?.played_at ?? index}`,
    [items],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: ROW_OVERSCAN,
    getItemKey,
  });

  useEffect(() => {
    const root = parentRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || items.length === 0) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) fetchRef.current();
      },
      { root, rootMargin: "400px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, items.length]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-white"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-white">Recently played</h1>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-zinc-500">
          No recent listens yet. They appear here from your log history (manual, Last.fm, Spotify sync, etc.).
        </p>
      ) : (
        <div
          ref={parentRef}
          className="max-h-[min(80vh,720px)] overflow-auto"
          aria-busy={loadingMore}
          role="list"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const t = items[virtualRow.index];
              if (!t) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  role="listitem"
                  className="pb-2"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2">
                    {t.album_image ? (
                      <img
                        src={t.album_image}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                        ♪
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">
                        {t.track_name}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {t.artist_name}
                        {t.album_name ? ` · ${t.album_name}` : ""}
                      </div>
                    </div>
                    <time
                      className="shrink-0 text-xs text-zinc-500"
                      dateTime={t.played_at}
                    >
                      {new Date(t.played_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore ? (
            <div
              ref={sentinelRef}
              className="flex min-h-12 items-center justify-center py-4"
            >
              {loadingMore ? (
                <span className="text-sm text-zinc-500" role="status">
                  Loading…
                </span>
              ) : (
                <span className="sr-only">Scroll for more</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
