'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSession } from 'next-auth/react';
import { FeedItem } from './feed-item';
import { ListenSessionGroupStoryCard } from '@/components/feed/listen-session-feed-card';
import {
  groupConsecutiveListenSessions,
  feedRowKey,
  type EnrichedFeedActivity,
} from '@/components/feed/group-feed-items';
import { FeedReactionsProvider } from '@/components/reactions/feed-reactions-context';

export type { EnrichedFeedActivity } from '@/components/feed/group-feed-items';

const ROW_ESTIMATE = 280;
const OVERSCAN = 6;

interface FeedListVirtualProps {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  className?: string;
  /** Max height of the scroll container (default 72vh). */
  maxHeight?: string;
  /** Current user (for reactions + engagement). Falls back to session when omitted. */
  viewerUserId?: string | null;
}

/** Story-style feed: grouped listen sessions; virtualized + infinite scroll. */
export function FeedListVirtual({
  initialItems,
  initialCursor,
  className = '',
  maxHeight = '72vh',
  viewerUserId: viewerUserIdProp,
}: FeedListVirtualProps) {
  const { data: session } = useSession();
  const viewerUserId =
    viewerUserIdProp ??
    (session?.user as { id?: string } | undefined)?.id ??
    '';
  const [items, setItems] = useState<EnrichedFeedActivity[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  const rows = useMemo(() => groupConsecutiveListenSessions(items), [items]);

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

  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const getItemKey = useCallback(
    (index: number) => feedRowKey(rows[index]!, index),
    [rows],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
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
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreRef.current();
      },
      { root, rootMargin: '400px', threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [nextCursor, rows.length]);

  const getSpotifyName = useCallback((activity: EnrichedFeedActivity) => {
    return activity.type === 'review'
      ? (activity as EnrichedFeedActivity & { spotifyName?: string }).spotifyName
      : undefined;
  }, []);

  if (items.length === 0 && !nextCursor) return null;

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <FeedReactionsProvider rows={rows}>
      <div
        ref={parentRef}
        className={`overflow-auto ${className}`}
        style={{ maxHeight }}
        role="feed"
        aria-busy={loading}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
          role="list"
          className="m-0 list-none pl-0"
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-4 sm:pb-5"
                role="listitem"
              >
                {row.kind === 'listen_group' ? (
                  <ListenSessionGroupStoryCard
                    sessions={row.sessions}
                    viewerUserId={viewerUserId}
                  />
                ) : (
                  <FeedItem
                    activity={row.activity}
                    spotifyName={getSpotifyName(row.activity)}
                    viewerUserId={viewerUserId}
                  />
                )}
              </div>
            );
          })}
        </div>
        {nextCursor ? (
          <div
            ref={sentinelRef}
            className="flex min-h-12 items-center justify-center py-4"
            aria-hidden={!loading}
          >
            {loading ? (
              <span className="text-sm text-zinc-500" role="status">
                Loading…
              </span>
            ) : (
              <span className="sr-only">Scroll for more activity</span>
            )}
          </div>
        ) : null}
      </div>
    </FeedReactionsProvider>
  );
}
