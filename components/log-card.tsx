'use client';

import Link from 'next/link';
import type { ListenLogWithUser } from '@/types';

interface LogCardProps {
  log: ListenLogWithUser;
  trackName?: string;
}

/**
 * @deprecated Use ListenCard for passive logs or ReviewCard for reviews.
 */
export function LogCard({ log, trackName }: LogCardProps) {
  const user = log.user;
  const displayName = trackName ?? log.track_id;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={user?.username ? `/profile/${user.username}` : '#'}
            className="flex items-center gap-2 shrink-0"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-700">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </span>
            <span className="truncate text-sm font-medium text-white hover:underline">
              {user?.username ?? 'Unknown'}
            </span>
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          <span className="text-zinc-500">Track:</span> {displayName}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {new Date(log.listened_at).toLocaleDateString()}
        </p>
      </div>
    </article>
  );
}
