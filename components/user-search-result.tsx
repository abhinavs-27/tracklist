'use client';

import Link from 'next/link';
import type { UserSearchResult as UserSearchResultType } from '@/types';
import { FollowButton } from '@/components/follow-button';

interface UserSearchResultProps {
  user: UserSearchResultType;
  showFollowButton?: boolean;
  onFollowChange?: () => void;
}

export function UserSearchResult({ user, showFollowButton = true, onFollowChange }: UserSearchResultProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50">
      <Link
        href={`/profile/${user.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300"
            aria-hidden
          >
            {user.username[0]?.toUpperCase() ?? '?'}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium text-white">{user.username}</p>
          <p className="text-xs text-zinc-500">
            {user.followers_count} follower{user.followers_count !== 1 ? 's' : ''}
          </p>
          {user.reasons && user.reasons.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-400">
              {user.reasons.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
      {showFollowButton && (
        <FollowButton
          userId={user.id}
          initialFollowing={user.is_following}
          onFollowChange={onFollowChange}
        />
      )}
    </div>
  );
}
