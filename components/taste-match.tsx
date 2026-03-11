'use client';

import { useMemo, useState } from 'react';
import type { TasteMatchResponse } from '@/types';

type SpotifyAlbumLite = {
  id: string;
  name: string;
  images: { url: string }[];
};

async function fetchAlbumLite(spotifyId: string): Promise<SpotifyAlbumLite | null> {
  const res = await fetch(`/api/spotify/album/${encodeURIComponent(spotifyId)}`);
  if (!res.ok) return null;
  return (await res.json()) as SpotifyAlbumLite;
}

export function TasteMatchSection({
  profileUserId,
  viewerUserId,
}: {
  profileUserId: string;
  viewerUserId?: string | null;
}) {
  const [userA, setUserA] = useState(viewerUserId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TasteMatchResponse | null>(null);
  const [albums, setAlbums] = useState<Record<string, SpotifyAlbumLite | null>>({});

  const canQuery = userA.trim().length > 0 && profileUserId.trim().length > 0 && userA !== profileUserId;

  const sharedIds = useMemo(
    () => (data?.sharedAlbums ?? []).map((a) => a.spotify_id).slice(0, 12),
    [data]
  );

  async function onCheck() {
    setError(null);
    setLoading(true);
    setData(null);

    try {
      if (!canQuery) {
        throw new Error(viewerUserId ? 'Cannot compare these users' : 'Enter a user id to compare');
      }

      const res = await fetch(
        `/api/taste-match?userA=${encodeURIComponent(userA)}&userB=${encodeURIComponent(profileUserId)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Taste match failed (${res.status})`);
      }
      const json = (await res.json()) as TasteMatchResponse;
      setData(json);

      const ids = json.sharedAlbums.map((a) => a.spotify_id).slice(0, 12);
      const results = await Promise.allSettled(ids.map((id) => fetchAlbumLite(id)));
      setAlbums((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          const id = ids[i];
          next[id] = r.status === 'fulfilled' ? r.value : null;
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check taste match');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Taste Compatibility</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Compare shared album listens.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {!viewerUserId ? (
            <input
              value={userA}
              onChange={(e) => setUserA(e.target.value)}
              placeholder="Your user id (UUID)"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 sm:w-64"
              aria-label="User A id"
            />
          ) : null}

          <button
            type="button"
            onClick={onCheck}
            disabled={loading || !canQuery}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-emerald-500/70 transition-colors"
          >
            {loading ? 'Checking…' : 'Check Taste Match'}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {data ? (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-bold text-white" data-testid="taste-score">
                {data.score}%
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                Shared albums: {data.sharedAlbumCount}
              </div>
            </div>
          </div>

          {sharedIds.length > 0 ? (
            <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
              {sharedIds.map((id) => {
                const album = albums[id];
                const img = album?.images?.[0]?.url;
                return (
                  <div
                    key={id}
                    className="aspect-square overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50"
                    title={album?.name ?? id}
                  >
                    {img ? (
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">♪</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No shared albums yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

