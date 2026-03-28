"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

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
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as ApiResponse;
      setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      if (!append) setItems([]);
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchPage(items.length, true);
  };

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
        <>
          <ul className="space-y-2">
            {items.map((t) => (
              <li
                key={`${t.track_id}-${t.played_at}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2"
              >
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
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
