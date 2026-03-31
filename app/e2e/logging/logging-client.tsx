'use client';

import { useState } from 'react';
import { AlbumLogButton } from '@/app/album/[id]/album-log-button';

export function E2ELoggingClient() {
  const [profile, setProfile] = useState<any>(null);
  const [searchResult, setSearchResult] = useState<any>(null);

  const handleMockLogListen = async () => {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: 'track_demo_1' }),
    });
  };

  const handleSyncSpotify = async () => {
    await fetch('/api/spotify/sync', { method: 'POST' });
  };

  const fetchProfile = async () => {
    const res = await fetch('/api/users/autotester');
    setProfile(await res.json());
  };

  const runSearch = async () => {
    const res = await fetch('/api/search?q=radiohead');
    setSearchResult(await res.json());
  };

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-2xl font-bold text-white">E2E Test Harness</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-300">Logging & Reviews</h2>
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
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-300">Spotify Sync</h2>
        <button
          type="button"
          onClick={handleSyncSpotify}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Sync recently played
        </button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-300">User Profile</h2>
        <button
          type="button"
          onClick={fetchProfile}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Fetch autotester profile
        </button>
        {profile && (
          <div id="profile-display" className="rounded bg-zinc-800 p-3 text-sm text-zinc-300">
            <p>Username: <span className="username">{profile.username}</span></p>
            <p>Bio: <span className="bio">{profile.bio}</span></p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-300">Search</h2>
        <button
          type="button"
          onClick={runSearch}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          Run Search
        </button>
        {searchResult && (
          <div id="search-display" className="rounded bg-zinc-800 p-3 text-sm text-zinc-300">
            <p>Top Artist: <span className="artist-name">{searchResult.artists?.items[0]?.name}</span></p>
          </div>
        )}
      </section>
    </div>
  );
}

