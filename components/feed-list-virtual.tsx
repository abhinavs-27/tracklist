'use client';

import { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FeedItem } from './feed-item';
import type { FeedActivity } from '@/types';

/** Enriched feed activity with optional spotifyName (from API). */
export type EnrichedFeedActivity = FeedActivity & { spotifyName?: string };

function feedItemKey(activity: EnrichedFeedActivity): string {
  if (activity.type === 'review') return activity.review.id;
  if (activity.type === 'follow') return activity.id;
  if (activity.type === 'listen_sessions_summary') return `summary-${activity.user_id}-${activity.created_at}`;
  return `${activity.user_id}-${activity.album_id}-${activity.created_at}`;
}

const ROW_ESTIMATE = 160;
const OVERSCAN = 3;

interface FeedListVirtualProps {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  className?: string;
  /** Max height of the scroll container (default 70vh). */
  maxHeight?: string;
}

export function FeedListVirtual({
  initialItems,
  initialCursor,
  className = '',
  maxHeight = '70vh',
}: FeedListVirtualProps) {
  const [items, setItems] = useState<EnrichedFeedActivity[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}&limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: EnrichedFeedActivity[]; next_cursor?: string | null };
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.next_cursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  const totalCount = items.length + (nextCursor ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const getSpotifyName = useCallback((activity: EnrichedFeedActivity) => {
    return activity.type === 'review' ? (activity as EnrichedFeedActivity & { spotifyName?: string }).spotifyName : undefined;
  }, []);

  if (items.length === 0 && !nextCursor) return null;

  return (
    <div ref={parentRef} className={`overflow-auto ${className}`} style={{ maxHeight }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const index = virtualRow.index;
          if (index >= items.length) {
            return (
              <div
                key="load-more"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
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
              </div>
            );
          }
          const activity = items[index];
          return (
            <div
              key={feedItemKey(activity)}
              data-index={index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-4"
            >
              <FeedItem activity={activity} spotifyName={getSpotifyName(activity)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
