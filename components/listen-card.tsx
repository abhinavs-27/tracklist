'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { ListenLogWithUser } from '@/types';

interface ListenCardProps {
  log: ListenLogWithUser;
  trackName?: string;
}

export function ListenCard({ log, trackName }: ListenCardProps) {
  const user = log.user;
  const displayName = trackName ?? log.track_id;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:bg-zinc-900/70">
      <div className="flex items-center gap-3">
        <Link
          href={user?.username ? `/profile/${user.username}` : '#'}
          className="flex items-center gap-2 shrink-0"
        >
          {user?.avatar_url ? (
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-zinc-700">
              <Image
                src={user.avatar_url}
                alt={user.username ?? ''}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-700">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-200">
            <span className="font-medium text-white">{user?.username ?? 'Unknown'}</span>
            {' listened to '}
            <Link href={`/song/${log.track_id}`} className="text-emerald-400 hover:underline">
              {displayName}
            </Link>
          </p>
          <p className="text-xs text-zinc-500">
            {new Date(log.listened_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </article>
  );
}
