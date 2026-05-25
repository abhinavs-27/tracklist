'use client';

import Link from 'next/link';
import { memo } from 'react';
import type { ReviewWithUser } from '@/types';
import { formatRelativeTime } from '@/lib/time';
import { LikeButton } from './like-button';
import { CommentThread } from './comment-thread';
import { formatStarDisplay } from "@/lib/ratings";

interface ReviewCardProps {
  review: ReviewWithUser;
  spotifyName?: string;
  likeCount?: number;
  commentCount?: number;
  liked?: boolean;
  showComments?: boolean;
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
  const entityHref =
    review.entity_type === 'album'
      ? `/album/${review.entity_id}`
      : `/song/${review.entity_id}`;
  const username = user?.username ?? "Unknown";

  // Story variant — used in feed cards
  if (variant === "story") {
    return (
      <div className="min-w-0">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <Link href={user?.id ? `/profile/${user.id}` : "#"} className="mt-0.5 shrink-0">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
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
              <Link href={entityHref} className="font-medium text-white hover:text-gold-400 hover:underline">
                {displayName}
              </Link>
              <span className="ml-1.5 text-amber-400/90">{formatStarDisplay(ratingNum)}</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{formatRelativeTime(review.created_at)}</p>
          </div>
        </div>
        {review.review_text ? (
          <p className="px-4 pb-3 line-clamp-4 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
            {review.review_text}
          </p>
        ) : null}
        <div className="flex items-center gap-4 border-t border-zinc-800/60 px-4 py-2.5">
          <LikeButton key={review.id} reviewId={review.id} initialLiked={liked} initialCount={likeCount} />
          {showComments ? <CommentThread reviewId={review.id} initialCount={commentCount} /> : null}
        </div>
      </div>
    );
  }

  // Default variant — used in the reviews list on album/song pages
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={user?.id ? `/profile/${user.id}` : "#"} className="mt-0.5 shrink-0">
          {user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 ring-1 ring-white/10">
              {username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          {/* Header row: username + stars + time */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={user?.id ? `/profile/${user.id}` : "#"} className="text-sm font-semibold text-white hover:underline">
              {username}
            </Link>
            <span className="text-base text-amber-400 leading-none">{formatStarDisplay(ratingNum)}</span>
            <span className="text-xs text-zinc-600">{formatRelativeTime(review.created_at)}</span>
          </div>

          {/* Review text */}
          {review.review_text && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
              {review.review_text}
            </p>
          )}

          {/* Engagement */}
          <div className="mt-3 flex items-center gap-4">
            <LikeButton key={review.id} reviewId={review.id} initialLiked={liked} initialCount={likeCount} />
            {showComments && <CommentThread reviewId={review.id} initialCount={commentCount} />}
          </div>
        </div>
      </div>
    </article>
  );
}

export const ReviewCard = memo(ReviewCardInner);
