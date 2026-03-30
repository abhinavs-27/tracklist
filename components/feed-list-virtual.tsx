'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
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

interface FeedListVirtualProps {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  className?: string;
  /** Max height of the scroll container (default 72vh). */
  maxHeight?: string;
  /** Current user (for reactions + engagement). Falls back to session when omitted. */
  viewerUserId?: string | null;
}

/** Story-style feed: grouped listen sessions, scroll fade-in + motion on each card. */
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

  const getSpotifyName = useCallback((activity: EnrichedFeedActivity) => {
    return activity.type === 'review' ? (activity as EnrichedFeedActivity & { spotifyName?: string }).spotifyName : undefined;
  }, []);

  if (items.length === 0 && !nextCursor) return null;

  return (
    <FeedReactionsProvider rows={rows}>
      <div className={`overflow-auto ${className}`} style={{ maxHeight }}>
        <ul className="m-0 list-none space-y-4 pl-0 sm:space-y-5">
          {rows.map((row, index) => (
            <li key={feedRowKey(row, index)} data-index={index}>
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
            </li>
          ))}
        </ul>
        {nextCursor && (
          <div className="pt-8">
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
    </FeedReactionsProvider>
  );
}
