'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { UserSearchResult as UserSearchResultType } from '@/types';
import { FollowButton } from '@/components/follow-button';
import { cardElevated } from '@/lib/ui/surface';

interface UserSearchResultProps {
  user: UserSearchResultType;
  showFollowButton?: boolean;
  onFollowChange?: () => void;
}

export function UserSearchResult({ user, showFollowButton = true, onFollowChange }: UserSearchResultProps) {
  const [expanded, setExpanded] = useState(false);
  const hasReasons = user.reasons && user.reasons.length > 0;

  return (
    <div className={`animate-fade-in-up ${cardElevated} p-4`}>
      {/* Compact row — always visible */}
      <div className="flex items-center gap-3">
        <Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300" aria-hidden>
              {user.username[0]?.toUpperCase() ?? '?'}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{user.username}</p>
            <p className="text-xs text-zinc-500">
              {user.followers_count} follower{user.followers_count !== 1 ? 's' : ''}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {showFollowButton && (
            <FollowButton userId={user.id} initialFollowing={user.is_following} onFollowChange={onFollowChange} />
          )}
          {hasReasons && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
              aria-label={expanded ? 'Hide reasons' : 'Show reasons'}
            >
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              >
                <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded reasons */}
      {expanded && hasReasons && (
        <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
          {user.reasons!.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
              <span className="mt-0.5 shrink-0 text-gold-500/70">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
