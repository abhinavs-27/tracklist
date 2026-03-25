'use client';

import { useState, useCallback, useEffect } from 'react';
import { FeedItem } from './feed-item';
import type { FeedActivity } from '@/types';

/** Enriched feed activity with optional spotifyName (from API). */
export type EnrichedFeedActivity = FeedActivity & { spotifyName?: string };

function feedItemKey(activity: EnrichedFeedActivity): string {
  if (activity.type === 'review') return activity.review.id;
  if (activity.type === 'follow') return activity.id;
  if (activity.type === 'feed_story') return `story-${activity.id}`;
  if (activity.type === 'listen_sessions_summary') return `summary-${activity.user_id}-${activity.created_at}`;
  return `${activity.user_id}-${activity.album_id}-${activity.created_at}`;
}

interface FeedListVirtualProps {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  className?: string;
  /** Max height of the scroll container (default 70vh). */
  maxHeight?: string;
}

/** Feed list with consistent spacing; expandable rows push content down instead of overlapping. */
export function FeedListVirtual({
  initialItems,
  initialCursor,
  className = '',
  maxHeight = '70vh',
}: FeedListVirtualProps) {
  const [items, setItems] = useState<EnrichedFeedActivity[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialCursor);
  }, [initialItems, initialCursor]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}&limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: EnrichedFeedActivity[];
        nextCursor?: string | null;
        next_cursor?: string | null;
      };
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? data.next_cursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  const getSpotifyName = useCallback((activity: EnrichedFeedActivity) => {
    return activity.type === 'review' ? (activity as EnrichedFeedActivity & { spotifyName?: string }).spotifyName : undefined;
  }, []);

  if (items.length === 0 && !nextCursor) return null;

  return (
    <div className={`overflow-auto ${className}`} style={{ maxHeight }}>
      <ul className="space-y-4 list-none pl-0 m-0">
        {items.map((activity, index) => (
          <li key={feedItemKey(activity)} data-index={index}>
            <FeedItem activity={activity} spotifyName={getSpotifyName(activity)} />
          </li>
        ))}
      </ul>
      {nextCursor && (
        <div className="pt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-800/50 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
