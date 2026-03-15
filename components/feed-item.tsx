'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ReviewCard } from './review-card';
import type { FeedActivity, FeedListenSession } from '@/types';

function formatRelativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

const DISPLAY_CAP = 10;

function ListenSessionRow({ session }: { session: FeedListenSession }) {
  const album = session.album;
  const image = album?.images?.[0]?.url;
  const trackName = session.track_name ?? album?.name ?? 'Track';
  const artistName = session.artist_name ?? album?.artists?.map((a) => a.name).join(', ') ?? '';
  return (
    <Link
      href={`/album/${session.album_id}`}
      className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-zinc-600">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white group-hover:text-emerald-400">{trackName}</p>
        {artistName ? <p className="truncate text-xs text-zinc-500">{artistName}</p> : null}
      </div>
    </Link>
  );
}

function ListenSessionsSummaryBlock({
  activity,
  formatRelativeTime,
}: {
  activity: Extract<FeedActivity, { type: 'listen_sessions_summary' }>;
  formatRelativeTime: (iso: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const username = activity.user?.username ?? 'Someone';
  const songCount = activity.song_count;
  const displayCount = Math.min(songCount, DISPLAY_CAP);
  const showPlus = songCount > DISPLAY_CAP;
  const timeAgo = formatRelativeTime(activity.created_at);
  const sessions = activity.sessions ?? [];

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 transition-colors hover:bg-zinc-900/70">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Link
            href={activity.user?.username ? `/profile/${activity.user.username}` : '#'}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            {activity.user?.avatar_url ? (
              <img
                src={activity.user.avatar_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-700">
                {username[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-300">
              <Link
                href={activity.user?.username ? `/profile/${activity.user.username}` : '#'}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-white hover:text-emerald-400 hover:underline"
              >
                {username}
              </Link>
              {' listened to '}
              <span className="text-zinc-400">
                {displayCount}{showPlus ? '+' : ''} song{(displayCount !== 1 || showPlus) ? 's' : ''}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {timeAgo}
              <span className="ml-1 text-zinc-600">{expanded ? '▼' : '▶'}</span>
            </p>
          </div>
        </div>
      </button>
      {expanded && sessions.length > 0 && (
        <div className="border-t border-zinc-800 px-4 pb-3 pt-2">
          <ul className="space-y-2">
            {sessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

interface FeedItemProps {
  activity: FeedActivity;
  spotifyName?: string;
}

export function FeedItem({ activity, spotifyName }: FeedItemProps) {
  if (activity.type === 'review') {
    return <ReviewCard review={activity.review} spotifyName={spotifyName} />;
  }

  if (activity.type === 'listen_sessions_summary') {
    return (
      <ListenSessionsSummaryBlock activity={activity} formatRelativeTime={formatRelativeTime} />
    );
  }

  if (activity.type === 'listen_session') {
    const username = activity.user?.username ?? 'Someone';
    const album = activity.album;
    const image = album?.images?.[0]?.url;
    const trackName = activity.track_name ?? album?.name ?? 'Track';
    const artistName = activity.artist_name ?? album?.artists?.map((a) => a.name).join(', ') ?? '';

    return (
      <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
        <div className="flex items-center gap-3">
          <Link
            href={activity.user?.username ? `/profile/${activity.user.username}` : '#'}
            className="shrink-0"
          >
            {activity.user?.avatar_url ? (
              <img
                src={activity.user.avatar_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-700">
                {username[0]?.toUpperCase() ?? '?'}
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-300">
              <Link
                href={activity.user?.username ? `/profile/${activity.user.username}` : '#'}
                className="font-medium text-white hover:text-emerald-400 hover:underline"
              >
                {username}
              </Link>
              {' listened to '}
            </p>
            <Link
              href={`/album/${activity.album_id}`}
              className="group mt-1 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 transition hover:border-zinc-600 hover:bg-zinc-800/50"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl text-zinc-600">♪</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white group-hover:text-emerald-400">{trackName}</p>
                {artistName ? (
                  <p className="truncate text-xs text-zinc-500">{artistName}</p>
                ) : null}
              </div>
            </Link>
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(activity.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </article>
    );
  }

  const follower = activity.follower_username ?? 'Someone';
  const following = activity.following_username ?? 'someone';

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <p className="text-sm text-zinc-300">
        <Link
          href={activity.follower_username ? `/profile/${activity.follower_username}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {follower}
        </Link>
        {' followed '}
        <Link
          href={activity.following_username ? `/profile/${activity.following_username}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {following}
        </Link>
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {new Date(activity.created_at).toLocaleDateString()}
      </p>
    </article>
  );
}
