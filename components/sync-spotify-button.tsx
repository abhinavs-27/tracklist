'use client';

import { useState } from 'react';

interface SyncSpotifyButtonProps {
  onSynced?: () => void;
}

function SyncSpotifyButton({ onSynced }: SyncSpotifyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch('/api/spotify/sync', {
        method: 'POST',
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error || 'Sync failed. Please try again.');
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { inserted?: number; skipped?: number; mode?: string }
        | null;

      const inserted = typeof data?.inserted === 'number' ? data.inserted : 0;
      if (inserted > 0) {
        setMessage(`Synced ${inserted} play${inserted === 1 ? '' : 's'} from Spotify.`);
      } else {
        setMessage('No new plays to sync.');
      }

      onSynced?.();
    } catch {
      setMessage('Sync failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Syncing…' : 'Sync Spotify Listening'}
      </button>
      {message && <p className="text-xs text-zinc-400">{message}</p>}
    </div>
  );
}

export default SyncSpotifyButton;

