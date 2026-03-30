'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { FeedItem } from './feed-item';
import type { FeedActivity } from '@/types';

/** Feed activity optionally enriched with entity display name and listen_session album (from API). */
type EnrichedFeedActivity = FeedActivity & { spotifyName?: string };

function feedItemKey(activity: EnrichedFeedActivity): string {
  if (activity.type === 'review') return activity.review.id;
  if (activity.type === 'follow') return activity.id;
  if (activity.type === 'listen_sessions_summary') return `summary-${activity.user_id}-${activity.created_at}`;
  if (activity.type === 'feed_story') return `story-${activity.id}`;
  return `${activity.user_id}-${activity.album_id}-${activity.created_at}`;
}

interface FeedLoadMoreProps {
  cursor: string;
  className?: string;
}

export function FeedLoadMore({ cursor, className = '' }: FeedLoadMoreProps) {
  const { data: session } = useSession();
  const viewerUserId =
    (session?.user as { id?: string } | undefined)?.id ?? '';
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EnrichedFeedActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(cursor);
  const [done, setDone] = useState(false);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      // API uses created_at < cursor so the same item is never returned again.
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}&limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: EnrichedFeedActivity[]; next_cursor?: string | null };
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
            <li key={feedItemKey(activity)}>
              <FeedItem
                activity={activity}
                spotifyName={activity.spotifyName}
                viewerUserId={viewerUserId}
              />
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
