"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 20;

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

type ApiResponse = { items: RecentTrack[]; hasMore: boolean };

export function RecentlyPlayedFeed() {
  const [items, setItems] = useState<RecentTrack[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spotify/recently-played?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Couldn't load recent plays");
      const data = (await res.json()) as ApiResponse;
      setItems((prev) => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []));
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
      if (!append) setItems([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchPage(0, false);
    })();
  }, [fetchPage]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ items: [] as RecentTrack[], hasMore: true, loadingMore: false });
  useEffect(() => {
    stateRef.current = { items, hasMore, loadingMore };
  });

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && stateRef.current.hasMore && !stateRef.current.loadingMore) {
          void fetchPage(stateRef.current.items.length, true);
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [fetchPage]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-xl bg-zinc-900/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-zinc-500">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No recent listens yet. Log listens, sync Last.fm, or connect Spotify to see tracks here.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((t) => (
        <div
          key={`${t.track_id}-${t.played_at}`}
          className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/40 px-3 py-2.5"
        >
          {t.album_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.album_image}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
              width={40}
              height={40}
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
              ♪
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{t.track_name}</p>
            <p className="truncate text-xs text-zinc-500">
              {t.artist_name}{t.album_name ? ` · ${t.album_name}` : ""}
            </p>
          </div>
          <time className="shrink-0 text-xs text-zinc-500" dateTime={t.played_at}>
            {new Date(t.played_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
      ))}

      <div ref={sentinelRef} className="flex min-h-10 items-center justify-center py-3">
        {loadingMore && <span className="text-sm text-zinc-500">Loading…</span>}
      </div>
    </div>
  );
}
