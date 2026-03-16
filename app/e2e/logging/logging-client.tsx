'use client';

import { AlbumLogButton } from '@/app/album/[id]/album-log-button';

export function E2ELoggingClient() {
  const handleMockLogListen = async () => {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: 'track_demo_1' }),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">E2E Logging</h1>
      <div className="flex flex-wrap gap-3">
        <AlbumLogButton spotifyId="2nLhD10Z7Sb4RFyCX2ZCyx" type="album" spotifyName="Demo Album" />
        <AlbumLogButton spotifyId="track_demo_1" type="song" spotifyName="Demo Track" />
        <button
          type="button"
          onClick={handleMockLogListen}
          className="rounded-full bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-600"
        >
          Mock log listen
        </button>
      </div>
    </div>
  );
}

