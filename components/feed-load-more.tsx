'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSession } from 'next-auth/react';
import { FeedItem } from './feed-item';
import type { FeedActivity } from '@/types';

/** Feed activity optionally enriched with entity display name and listen_session album (from API). */
type EnrichedFeedActivity = FeedActivity & { spotifyName?: string };

const ROW_ESTIMATE = 220;
const OVERSCAN = 5;

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

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(nextCursor)}&limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: EnrichedFeedActivity[]; next_cursor?: string | null };
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.next_cursor ?? null);
      if (!data.next_cursor) setDone(true);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const bootstrapSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const getItemKey = useCallback(
    (index: number) => feedItemKey(items[index]!),
    [items],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
    getItemKey,
  });

  useEffect(() => {
    const root = parentRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !nextCursor) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void loadMoreRef.current();
      },
      { root, rootMargin: '400px', threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [nextCursor, items.length]);

  /** First page when nothing loaded yet (replaces manual “Load more” click). */
  useEffect(() => {
    if (items.length > 0 || !nextCursor || done) return;
    const el = bootstrapSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) void loadMoreRef.current();
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, nextCursor, done]);

  if (done && items.length === 0) return null;

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className={className}>
      {items.length === 0 && nextCursor && !done ? (
        <div ref={bootstrapSentinelRef} className="min-h-8 w-full" aria-hidden />
      ) : null}
      {items.length > 0 && (
        <div
          ref={parentRef}
          className="max-h-[min(70vh,560px)] overflow-auto"
          aria-busy={loading}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const activity = items[virtualRow.index];
              if (!activity) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="pb-4"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FeedItem
                    activity={activity}
                    spotifyName={activity.spotifyName}
                    viewerUserId={viewerUserId}
                  />
                </div>
              );
            })}
          </div>
          {nextCursor ? (
            <div
              ref={sentinelRef}
              className="flex min-h-12 items-center justify-center py-4"
            >
              {loading ? (
                <span className="text-sm text-zinc-500" role="status">
                  Loading…
                </span>
              ) : (
                <span className="sr-only">Scroll for more</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
