'use client';

import Link from 'next/link';
import { ReviewCard } from './review-card';
import type { FeedActivity } from '@/types';

interface FeedItemProps {
  activity: FeedActivity;
  spotifyName?: string;
}

export function FeedItem({ activity, spotifyName }: FeedItemProps) {
  if (activity.type === 'review') {
    return <ReviewCard review={activity.review} spotifyName={spotifyName} />;
  }

  const follower = activity.follower_username ?? 'Someone';
  const following = activity.following_username ?? 'someone';

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <p className="text-sm text-zinc-300">
        <Link
          href={activity.follower_username ? `/profile/${activity.follower_username}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {follower}
        </Link>
        {' followed '}
        <Link
          href={activity.following_username ? `/profile/${activity.following_username}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {following}
        </Link>
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {new Date(activity.created_at).toLocaleDateString()}
      </p>
    </article>
  );
}
