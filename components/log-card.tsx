'use client';

import Link from 'next/link';
import type { LogWithUser } from '@/types';
import { LikeButton } from './like-button';
import { CommentThread } from './comment-thread';

interface LogCardProps {
  log: LogWithUser;
  spotifyName?: string;
  spotifyType?: string;
  showComments?: boolean;
}

export function LogCard({ log, spotifyName, spotifyType, showComments = true }: LogCardProps) {
  const user = log.user;
  const rating = log.rating ?? 0;
  const displayName = spotifyName ?? log.title ?? log.spotify_id;
  const typeLabel = log.type === 'album' ? 'Album' : 'Track';

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
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
            <span className="text-zinc-500">{typeLabel}:</span> {displayName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-[13px]">
            <span className="text-amber-400" aria-label={`Rating: ${rating} out of 5`}>
              {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(log.listened_at).toLocaleDateString()}
            </span>
          </div>
          {log.review && (
            <p className="mt-2 text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
              {log.review}
            </p>
          )}
        </div>
      </div>
      <div className="relative mt-3 flex items-center gap-4">
        <LikeButton logId={log.id} initialLiked={!!log.liked} initialCount={log.like_count ?? 0} />
        {showComments && (
          <CommentThread logId={log.id} initialCount={log.comment_count ?? 0} />
        )}
      </div>
    </article>
  );
}
