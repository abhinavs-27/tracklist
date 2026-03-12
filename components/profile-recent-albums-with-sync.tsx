'use client';

import { useState } from 'react';
import { SpotifyConnectionCard } from '@/components/spotify-connection-card';
import { RecentAlbumsGrid } from '@/components/recent-albums-grid';

export function ProfileRecentAlbumsWithSync({
  userId,
  username,
  showSpotifyControls,
  spotifyConnected = false,
}: {
  userId: string;
  username: string;
  showSpotifyControls: boolean;
  /** Server-derived: user has a row in spotify_tokens. Passed from profile page. */
  spotifyConnected?: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      {showSpotifyControls ? (
        <SpotifyConnectionCard
          username={username}
          spotifyConnected={spotifyConnected}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}

      <RecentAlbumsGrid userId={userId} refreshKey={refreshKey} />
    </div>
  );
}

