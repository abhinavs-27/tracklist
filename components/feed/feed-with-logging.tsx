"use client";

import Link from "next/link";
import {
  FeedListVirtual,
  type EnrichedFeedActivity,
} from "@/components/feed-list-virtual";
import { RecentlyViewedLogStrip } from "@/components/logging/recently-viewed-strip";
import { useRecentViews } from "@/components/logging/recent-views-provider";

type Props = {
  initialItems: EnrichedFeedActivity[];
  initialCursor: string | null;
  /** Hide “pick up where you left off” when user has Last.fm connected. */
  suppressPickupStrip?: boolean;
};

export function FeedWithLogging({
  initialItems,
  initialCursor,
  suppressPickupStrip = false,
}: Props) {
  const { items: recentItems } = useRecentViews();

  return (
    <>
      {recentItems.length > 0 ? (
        <RecentlyViewedLogStrip
          items={recentItems}
          suppressForLastfm={suppressPickupStrip}
        />
      ) : null}
      {initialItems.length === 0 && !initialCursor ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">
            Your feed is empty. Follow people to see what they&apos;re listening to.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block text-emerald-400 hover:underline"
          >
            Find people to follow
          </Link>
        </div>
      ) : (
        <FeedListVirtual
          initialItems={initialItems}
          initialCursor={initialCursor}
          className="pr-1"
          maxHeight="72vh"
        />
      )}
    </>
  );
}
