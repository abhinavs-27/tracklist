'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DiscoverUser, DiscoverUsersResponse } from '@/types';
import { resolveUserAvatarUrl } from '@/lib/profile-pictures/resolve-avatar-display';
import { FollowButton } from '@/components/follow-button';

type SpotifyAlbumLite = {
  id: string;
  name: string;
  images: { url: string }[];
};

export function DiscoverUsersGrid({ limit = 16 }: { limit?: number }) {
  const [users, setUsers] = useState<DiscoverUser[] | null>(null);
  const [albumsById, setAlbumsById] = useState<Record<string, SpotifyAlbumLite | null | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(null);
      setUsers(null);
      try {
        const res = await fetch(`/api/discover?limit=${encodeURIComponent(String(limit))}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Couldn’t load people to follow");
        }
        const json = (await res.json()) as DiscoverUsersResponse;
        if (cancelled) return;
        setUsers(json.users ?? []);

        const ids = (json.users ?? [])
          .map((u) => u.latest_album_spotify_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .filter((id) => albumsById[id] === undefined);

        if (!ids.length) return;

        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const r = await fetch(`/api/spotify/album/${encodeURIComponent(id)}`);
            if (!r.ok) return null;
            return (await r.json()) as SpotifyAlbumLite;
          })
        );

        if (cancelled) return;
        setAlbumsById((prev) => {
          const next = { ...prev };
          results.forEach((r, i) => {
            const id = ids[i];
            next[id] = r.status === 'fulfilled' ? r.value : null;
          });
          return next;
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load discover users');
        setUsers([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const items = useMemo(() => users ?? [], [users]);

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <p className="text-sm text-zinc-400">{error}</p>
      </div>
    );
  }

  if (users === null) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: Math.min(limit, 12) }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-zinc-800" />
              <div className="flex-1">
                <div className="h-4 w-32 rounded bg-zinc-800" />
                <div className="mt-2 h-3 w-24 rounded bg-zinc-800" />
              </div>
              <div className="h-9 w-24 rounded-full bg-zinc-800" />
            </div>
            <div className="mt-4 aspect-square rounded-xl bg-zinc-800/60" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-zinc-500">No recent activity yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((u) => {
        const albumId = u.latest_album_spotify_id;
        const album = albumId ? albumsById[albumId] : null;
        const cover = album?.images?.[0]?.url;
        const avatarSrc = resolveUserAvatarUrl(u.id, u.avatar_url);
        return (
          <article key={u.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <Link
                href={`/profile/${u.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                      {u.username?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-medium text-white hover:underline"
                    title={u.username}
                  >
                    {u.username}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">Recently active</div>
                </div>
              </Link>

              {!u.is_viewer ? <FollowButton userId={u.id} initialFollowing={u.is_following} /> : null}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="aspect-square">
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-700">♪</div>
                )}
              </div>
            </div>

            {album?.name ? (
              <div className="mt-2 text-sm text-zinc-300">
                <span className="text-zinc-500">Recent:</span> {album.name}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

