'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/time';

export type FriendActivityItem = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  listened_at: string;
  rating?: number | null;
};

export function FriendsWhoListened({ activity }: { activity: FriendActivityItem[] }) {
  if (activity.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        Friends who listened
      </h2>
      <ul className="space-y-2">
        {activity.map((l, i) => (
          <li key={`${l.user_id}-${l.listened_at}-${i}`}>
            <Link
              href={`/profile/${l.username}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm transition hover:border-zinc-600"
            >
              {l.avatar_url ? (
                <img
                  src={l.avatar_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">
                  {l.username[0]?.toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-zinc-200">{l.username}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {formatRelativeTime(l.listened_at)}
              </span>
              {l.rating != null && (
                <span className="shrink-0 text-amber-400">★ {l.rating}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
