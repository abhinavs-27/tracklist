'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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

const ROW_ESTIMATE = 520;
const OVERSCAN = 4;

interface FeedListVirtualProps {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  className?: string;
  /** @deprecated — feed now uses window scroll. Ignored. */
  maxHeight?: string;
  /** Current user (for reactions + engagement). Falls back to session when omitted. */
  viewerUserId?: string | null;
}

/** Story-style feed: window-scroll virtualizer + infinite scroll. */
export function FeedListVirtual({
  initialItems,
  initialCursor,
  className = '',
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
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);

  // Reset local state when the parent hands us a new initial page (e.g. feed
  // filter changed). Adjusting state during render (rather than in an effect)
  // avoids an extra commit that would briefly flash the previous page.
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
    setNextCursor(initialCursor);
  }

  const rows = useMemo(() => groupConsecutiveListenSessions(items), [items]);

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

  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  const getItemKey = useCallback(
    (index: number) => feedRowKey(rows[index]!, index),
    [rows],
  );

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
    getItemKey,
    scrollMargin: listNode?.offsetTop ?? 0,
  });

  // Infinite scroll: load more when near the bottom of the list
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (!nextCursor || loading || virtualItems.length === 0) return;
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rows.length - OVERSCAN - 1) {
      void loadMoreRef.current();
    }
  }, [virtualizer.getVirtualItems(), rows.length, nextCursor, loading]);

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
        ref={setListNode}
        className={className}
        role="feed"
        aria-busy={loading}
        style={{ position: 'relative', height: `${virtualizer.getTotalSize()}px` }}
      >
        <div
          role="list"
          className="m-0 list-none pl-0"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${(virtualItems[0]?.start ?? 0) - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="pb-3 sm:pb-4"
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
        {loading && (
          <div className="flex justify-center py-6">
            <span className="text-sm text-zinc-500">Loading…</span>
          </div>
        )}
      </div>
    </FeedReactionsProvider>
  );
}
