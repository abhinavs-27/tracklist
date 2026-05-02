'use client';

import Link from 'next/link';
import { memo } from 'react';
import type { ReviewWithUser } from '@/types';
import { formatRelativeTime } from '@/lib/time';
import { LikeButton } from './like-button';
import { CommentThread } from './comment-thread';
import { cardOutlined } from "@/lib/ui/surface";
import { formatStarDisplay } from "@/lib/ratings";

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
  const ratingNum = Math.max(0, Math.min(5, Number(review.rating)));
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
    const username = user?.username ?? "Unknown";
    return (
      <div className="min-w-0">
        {/* Header — matches listen session card style */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <Link href={user?.id ? `/profile/${user.id}` : "#"} className="mt-0.5 shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 ring-1 ring-white/10">
                {username[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">
              <Link href={user?.id ? `/profile/${user.id}` : "#"} className="font-semibold text-white hover:underline">
                {username}
              </Link>
              <span className="text-zinc-400"> rated </span>
              <Link href={entityHref} className="font-medium text-white hover:text-emerald-400 hover:underline">
                {displayName}
              </Link>
              <span className="ml-1.5 text-amber-400/90">{formatStarDisplay(ratingNum)}</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{formatRelativeTime(review.created_at)}</p>
          </div>
        </div>

        {/* Review text */}
        {review.review_text ? (
          <p className="px-4 pb-3 line-clamp-4 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
            {review.review_text}
          </p>
        ) : null}

        {/* Engagement */}
        <div className="flex items-center gap-4 border-t border-zinc-800/60 px-4 py-2.5">
          <LikeButton
            key={review.id}
            reviewId={review.id}
            initialLiked={liked}
            initialCount={likeCount}
          />
          {showComments ? (
            <CommentThread reviewId={review.id} initialCount={commentCount} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article className={cardOutlined}>
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
          <span
            className="text-amber-400"
            aria-label={`Rating: ${ratingNum} out of 5`}
          >
            {formatStarDisplay(ratingNum)}
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
        <LikeButton
          key={review.id}
          reviewId={review.id}
          initialLiked={liked}
          initialCount={likeCount}
        />
        {showComments && (
          <CommentThread reviewId={review.id} initialCount={commentCount} />
        )}
      </div>
    </article>
  );
}

export const ReviewCard = memo(ReviewCardInner);
