'use client';

import { useEffect, useState } from 'react';

type SpotifyStatusResponse = { connected: boolean; expires_at?: string | null };

export function SpotifyConnectionCard({
  userId,
  spotifyConnected: spotifyConnectedFromServer,
  onSynced,
}: {
  userId: string;
  /** When provided (from server-side spotify_tokens check), used immediately so no loading flash. */
  spotifyConnected?: boolean;
  onSynced?: () => void;
}) {
  const [status, setStatus] = useState<SpotifyStatusResponse | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setError(null);
    try {
      const res = await fetch('/api/spotify/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status failed (${res.status})`);
      setStatus((await res.json()) as SpotifyStatusResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Spotify status');
      setStatus({ connected: false });
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function onSync() {
    setError(null);
    setSyncLoading(true);
    try {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Sync failed (${res.status})`);
      }
      onSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }

  // Use server-derived state when provided; otherwise use fetched status (don't assume disconnected)
  const known = spotifyConnectedFromServer !== undefined || status !== null;
  const connected =
    spotifyConnectedFromServer !== undefined
      ? spotifyConnectedFromServer
      : (status !== null && status.connected);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Spotify</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Status:{' '}
            <span className={connected ? 'text-emerald-400' : 'text-zinc-400'}>
              {!known ? 'Loading…' : connected ? 'Connected' : 'Not connected'}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!known ? (
            <span
              aria-hidden
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/30 px-4 py-2 text-sm font-medium text-zinc-500"
            >
              Loading…
            </span>
          ) : connected ? (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/30 px-4 py-2 text-sm font-medium text-zinc-500 cursor-not-allowed"
            >
              Spotify Connected
            </button>
          ) : (
            <a
              href={`/api/spotify/connect?returnTo=${encodeURIComponent(`/profile/${userId}`)}`}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/30 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-600"
            >
              Connect Spotify
            </a>
          )}
          <button
            type="button"
            onClick={onSync}
            disabled={!connected || syncLoading}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncLoading ? 'Syncing…' : 'Sync recently played'}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {connected && status?.expires_at ? (
        <p className="mt-3 text-xs text-zinc-600">Token expires: {new Date(status.expires_at).toLocaleString()}</p>
      ) : null}
    </section>
  );
}

