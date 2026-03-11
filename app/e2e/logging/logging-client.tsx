'use client';

import { AlbumLogButton } from '@/app/album/[id]/album-log-button';

export function E2ELoggingClient() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">E2E Logging</h1>
      <div className="flex flex-wrap gap-3">
        <AlbumLogButton spotifyId="2nLhD10Z7Sb4RFyCX2ZCyx" type="album" spotifyName="Demo Album" />
        <AlbumLogButton spotifyId="track_demo_1" type="song" spotifyName="Demo Track" />
      </div>
    </div>
  );
}

