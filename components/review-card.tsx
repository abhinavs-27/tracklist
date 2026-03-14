'use client';

import Link from 'next/link';
import type { ReviewWithUser } from '@/types';
import { LikeButton } from './like-button';
import { CommentThread } from './comment-thread';

interface ReviewCardProps {
  review: ReviewWithUser;
  spotifyName?: string;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  showComments?: boolean;
}

export function ReviewCard({
  review,
  spotifyName,
  likeCount = 0,
  commentCount = 0,
  liked = false,
  showComments = true,
}: ReviewCardProps) {
  const user = review.user;
  const rating = Math.max(0, Math.min(5, Math.floor(review.rating)));
  const displayName = spotifyName ?? review.entity_id;
  const typeLabel = review.entity_type === 'album' ? 'Album' : 'Track';
  const entityHref =
    review.entity_type === 'album'
      ? `/album/${review.entity_id}`
      : `/song/${review.entity_id}`;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={user?.username ? `/profile/${user.username}` : '#'}
            className="flex items-center gap-2 shrink-0"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-700">
                {user?.username?.[0]?.toUpperCase() ?? '?'}
              </span>
            )}
            <span className="truncate text-sm font-medium text-white hover:underline">
              {user?.username ?? 'Unknown'}
            </span>
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          <span className="text-zinc-500">{typeLabel}:</span>{' '}
          <Link href={entityHref} className="hover:text-emerald-400 hover:underline">
            {displayName}
          </Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-[13px]">
          <span className="text-amber-400" aria-label={`Rating: ${rating} out of 5`}>
            {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
          </span>
          <span className="text-xs text-zinc-500">
            {new Date(review.created_at).toLocaleDateString()}
          </span>
        </div>
        {review.review_text && (
          <p className="mt-2 text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
            {review.review_text}
          </p>
        )}
      </div>
      <div className="relative mt-3 flex items-center gap-4">
        <LikeButton reviewId={review.id} initialLiked={liked} initialCount={likeCount} />
        {showComments && (
          <CommentThread reviewId={review.id} initialCount={commentCount} />
        )}
      </div>
    </article>
  );
}
