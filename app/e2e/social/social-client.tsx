'use client';

import { LogCard } from '@/components/log-card';
import type { LogWithUser } from '@/types';

const demoLog: LogWithUser = {
  id: 'log_demo_1',
  user_id: 'user_demo_1',
  spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
  type: 'album',
  title: 'Demo Album',
  rating: 4,
  review: 'Great record.',
  listened_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  created_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  user: { id: 'user_demo_1', username: 'alice', avatar_url: null },
  like_count: 0,
  comment_count: 0,
  liked: false,
};

export function E2ESocialClient() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">E2E Social</h1>
      <LogCard log={demoLog} spotifyName={demoLog.title ?? undefined} showComments />
    </div>
  );
}

