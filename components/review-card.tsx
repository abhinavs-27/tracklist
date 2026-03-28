'use client';

import Link from 'next/link';
import { memo } from 'react';
import type { ReviewWithUser } from '@/types';
import { formatRelativeTime } from '@/lib/time';
import { LikeButton } from './like-button';
import { CommentThread } from './comment-thread';

interface ReviewCardProps {
  review: ReviewWithUser;
  spotifyName?: string;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  showComments?: boolean;
  /** Flatter layout for story-style feed cards (no inner border). */
  variant?: "default" | "story";
}

function ReviewCardInner({
  review,
  spotifyName,
  likeCount = 0,
  commentCount = 0,
  liked = false,
  showComments = true,
  variant = "default",
}: ReviewCardProps) {
  const user = review.user;
  const rating = Math.max(0, Math.min(5, Math.floor(review.rating)));
  const fallback = review.entity_type === 'album' ? 'Unknown album' : 'Unknown track';
  const rawName = spotifyName ?? fallback;
  const displayName =
    typeof rawName === 'string' && rawName.trim() && !/^[a-zA-Z0-9]{22}$/.test(rawName.trim())
      ? rawName.trim()
      : fallback;
  const typeLabel = review.entity_type === 'album' ? 'Album' : 'Track';
  const entityHref =
    review.entity_type === 'album'
      ? `/album/${review.entity_id}`
      : `/song/${review.entity_id}`;

  if (variant === "story") {
    return (
      <div className="min-w-0 p-5 pt-6">
        <h2 className="text-lg font-bold leading-snug tracking-tight text-white sm:text-xl">
          <Link
            href={user?.id ? `/profile/${user.id}` : "#"}
            className="hover:text-emerald-400 hover:underline"
          >
            {user?.username ?? "Unknown"}
          </Link>
          <span className="font-normal text-zinc-400"> reviewed </span>
          <Link href={entityHref} className="text-white hover:text-emerald-400 hover:underline">
            {displayName}
          </Link>
        </h2>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">{typeLabel}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="text-amber-400" aria-label={`Rating: ${rating} out of 5`}>
            {"★".repeat(rating)}
            {"☆".repeat(5 - rating)}
          </span>
          <span className="tabular-nums">{formatRelativeTime(review.created_at)}</span>
        </div>
        {review.review_text ? (
          <p className="mt-4 line-clamp-6 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-line">
            {review.review_text}
          </p>
        ) : null}
        <div className="relative mt-5 flex items-center gap-4">
          <LikeButton reviewId={review.id} initialLiked={liked} initialCount={likeCount} />
          {showComments ? (
            <CommentThread reviewId={review.id} initialCount={commentCount} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={user?.id ? `/profile/${user.id}` : '#'}
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
            {formatRelativeTime(review.created_at)}
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

export const ReviewCard = memo(ReviewCardInner);
