'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const PROFILE_LIMIT = 10;

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

type ApiResponse = { items: RecentTrack[]; hasMore?: boolean };

export function RecentlyPlayedTracks() {
  const [items, setItems] = useState<RecentTrack[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spotify/recently-played?limit=${PROFILE_LIMIT}&offset=0`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items ?? []);
          setHasMore(data.hasMore ?? false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setItems([]);
          setHasMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Recently played</h2>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
      </section>
    );
  }

  if (items === null) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Recently played</h2>
        <div className="mt-3 h-32 animate-pulse rounded bg-zinc-800/50" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-lg font-semibold text-white">Recently played</h2>
        <p className="mt-2 text-sm text-zinc-500">
          No recent listens yet. Log from search, Last.fm sync, or Spotify history when connected.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Recently played</h2>
        {(hasMore || items.length >= PROFILE_LIMIT) && (
          <Link
            href="/recently-played"
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            See more
          </Link>
        )}
      </div>
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
              <div className="truncate text-sm font-medium text-white">{t.track_name}</div>
              <div className="truncate text-xs text-zinc-500">
                {t.artist_name}
                {t.album_name ? ` · ${t.album_name}` : ''}
              </div>
            </div>
            <time className="shrink-0 text-xs text-zinc-500" dateTime={t.played_at}>
              {new Date(t.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
