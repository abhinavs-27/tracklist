'use client';

import { useState } from 'react';
import { FeedItem } from './feed-item';
import type { FeedActivity } from '@/types';

interface FeedLoadMoreProps {
  cursor: string;
  className?: string;
}

export function FeedLoadMore({ cursor, className = '' }: FeedLoadMoreProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(cursor);
  const [done, setDone] = useState(false);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      // API uses created_at < cursor so the same item is never returned again.
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.next_cursor ?? null);
      if (!data.next_cursor) setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done && items.length === 0) return null;

  return (
    <div className={className}>
      {items.length > 0 && (
        <ul className="space-y-4">
          {items.map((activity) => (
            <li key={activity.type === 'review' ? activity.review.id : activity.id}>
              <FeedItem activity={activity} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-4 w-full rounded-lg border border-zinc-600 bg-zinc-800/50 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
