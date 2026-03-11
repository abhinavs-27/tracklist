'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AlbumLog = {
  id: string;
  spotify_id: string;
  type: 'album';
  rating: number;
  listened_at: string;
  created_at: string;
};

type SpotifyAlbumLite = {
  id: string;
  name: string;
  images: { url: string; width?: number | null; height?: number | null }[];
};

function formatStars(rating: number) {
  const r = Math.max(0, Math.min(5, Math.floor(rating)));
  return `${'★'.repeat(r)}${'☆'.repeat(5 - r)}`;
}

export function RecentAlbumsGrid({ userId, refreshKey }: { userId: string; refreshKey?: number | string }) {
  const [logs, setLogs] = useState<AlbumLog[] | null>(null);
  const [albumsById, setAlbumsById] = useState<Record<string, SpotifyAlbumLite | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(null);
      setLogs(null);

      try {
        const res = await fetch(`/api/logs?user_id=${encodeURIComponent(userId)}&limit=50`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
        const data = (await res.json()) as unknown[];

        const albumLogs = data
          .filter((l): l is AlbumLog => {
            const x = l as Partial<AlbumLog>;
            return (
              typeof x?.id === 'string' &&
              typeof x?.spotify_id === 'string' &&
              x?.type === 'album' &&
              typeof x?.rating === 'number' &&
              typeof x?.listened_at === 'string' &&
              typeof x?.created_at === 'string'
            );
          })
          .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
          .slice(0, 12);

        if (cancelled) return;
        setLogs(albumLogs);

        const uniqueSpotifyIds = [...new Set(albumLogs.map((l) => l.spotify_id))];
        if (!uniqueSpotifyIds.length) return;

        const albumResults = await Promise.allSettled(
          uniqueSpotifyIds.map(async (id) => {
            const r = await fetch(`/api/spotify/album/${encodeURIComponent(id)}`);
            if (!r.ok) throw new Error(`Album fetch failed (${r.status})`);
            return (await r.json()) as SpotifyAlbumLite;
          })
        );

        if (cancelled) return;
        setAlbumsById((prev) => {
          const next = { ...prev };
          for (const result of albumResults) {
            if (result.status === 'fulfilled' && result.value?.id) {
              next[result.value.id] = result.value;
            }
          }
          return next;
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load recent albums');
        setLogs([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey]);

  const items = useMemo(() => logs ?? [], [logs]);

  if (error) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-lg font-semibold text-white">Recent albums</h2>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
      </section>
    );
  }

  if (logs === null) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Recent albums</h2>
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Recent albums</h2>
        <p className="text-xs text-zinc-500">Last 12</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {items.map((log) => {
          const album = albumsById[log.spotify_id];
          const image = album?.images?.[0]?.url;
          const listened = new Date(log.listened_at).toLocaleDateString();
          const stars = formatStars(log.rating);

          return (
            <Link
              key={log.id}
              href={`/album/${log.spotify_id}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
              aria-label={album?.name ? `${album.name} (${stars})` : `Album (${stars})`}
            >
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-600">♪</div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-amber-300 text-sm leading-none">{stars}</div>
                    <div className="mt-1 text-[11px] text-zinc-200">{listened}</div>
                  </div>
                  <div className="hidden max-w-[60%] text-right text-[11px] text-zinc-200 sm:block">
                    <span className="block truncate">{album?.name ?? ''}</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

