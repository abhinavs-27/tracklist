'use client';

import { RecentAlbumsGrid } from '@/components/recent-albums-grid';

export function E2ERecentAlbumsClient() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">E2E RecentAlbumsGrid</h1>
      <RecentAlbumsGrid userId="user_demo_1" />
    </div>
  );
}

