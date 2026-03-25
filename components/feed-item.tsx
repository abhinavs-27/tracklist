'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { ReviewCard } from './review-card';
import { formatRelativeTime } from '@/lib/time';
import type { FeedActivity, FeedListenSession } from '@/types';

const DISPLAY_CAP = 10;

const ListenSessionRow = memo(function ListenSessionRow({ session }: { session: FeedListenSession }) {
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
});

const ListenSessionsSummaryBlock = memo(function ListenSessionsSummaryBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: 'listen_sessions_summary' }>;
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
            href={activity.user?.id ? `/profile/${activity.user.id}` : '#'}
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
                href={activity.user?.id ? `/profile/${activity.user.id}` : '#'}
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
});

interface FeedItemProps {
  activity: FeedActivity;
  spotifyName?: string;
}

function starsRow(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(r)}${"☆".repeat(5 - r)}`;
}

const FeedStoryBlock = memo(function FeedStoryBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: "feed_story" }>;
}) {
  const username = activity.user?.username ?? "Someone";
  const p = activity.payload;
  const timeAgo = formatRelativeTime(activity.created_at);

  const headline = (() => {
    switch (activity.story_kind) {
      case "discovery": {
        const name = (p.artist_name as string) ?? "an artist";
        const id = p.artist_id as string | undefined;
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" discovered "}
            {id ? (
              <Link href={`/artist/${id}`} className="text-emerald-400 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-zinc-200">{name}</span>
            )}
          </>
        );
      }
      case "top-artist-shift": {
        const name = (p.artist_name as string) ?? "an artist";
        const id = p.artist_id as string | undefined;
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" is really into "}
            {id ? (
              <Link href={`/artist/${id}`} className="text-emerald-400 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-zinc-200">{name}</span>
            )}
            {" lately"}
          </>
        );
      }
      case "rating": {
        const title = (p.title as string) ?? "something";
        const et = p.entity_type as string;
        const eid = p.entity_id as string;
        const rating = Number(p.rating) || 0;
        const href =
          et === "album" ? `/album/${eid}` : et === "song" ? `/song/${eid}` : "#";
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" rated "}
            <Link href={href} className="text-emerald-400 hover:underline">
              {title}
            </Link>
            <span className="ml-1.5 text-amber-400/95" aria-label={`${rating} stars`}>
              {starsRow(rating)}
            </span>
          </>
        );
      }
      case "streak": {
        const days = Number(p.days) || 0;
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {` is on a ${days}-day listening streak`}
          </>
        );
      }
      case "binge": {
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" went on a music binge"}
          </>
        );
      }
      case "new-list": {
        const title = (p.title as string) ?? "a list";
        const lid = p.list_id as string | undefined;
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" created a list: "}
            {lid ? (
              <Link href={`/lists/${lid}`} className="text-emerald-400 hover:underline">
                {title}
              </Link>
            ) : (
              <span className="text-zinc-200">{title}</span>
            )}
          </>
        );
      }
      case "milestone": {
        const m = p.milestone as number | undefined;
        return (
          <>
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
              className="font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {` hit ${m ?? ""} total listens on Tracklist`}
          </>
        );
      }
      default:
        return <span className="text-zinc-400">Activity</span>;
    }
  })();

  const kindLabel = (() => {
    switch (activity.story_kind) {
      case "discovery":
        return "Discovery";
      case "binge":
        return "Listening";
      case "top-artist-shift":
        return "Trending";
      case "rating":
        return "Review";
      case "streak":
        return "Streak";
      case "new-list":
        return "List";
      case "milestone":
        return "Milestone";
      default:
        return "Update";
    }
  })();

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="flex items-start gap-3">
        <Link
          href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
          className="shrink-0"
        >
          {activity.user?.avatar_url ? (
            <img
              src={activity.user.avatar_url}
              alt=""
              className="h-9 w-9 rounded-full border border-zinc-700 object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-200">
              {username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-zinc-300">{headline}</p>
          <p className="mt-1 text-xs text-zinc-500">
            <span className="text-zinc-600">{kindLabel}</span>
            <span className="mx-1.5">·</span>
            {timeAgo}
          </p>
        </div>
      </div>
    </article>
  );
});

function FeedItemInner({ activity, spotifyName }: FeedItemProps) {
  if (activity.type === 'review') {
    return <ReviewCard review={activity.review} spotifyName={spotifyName} />;
  }

  if (activity.type === 'feed_story') {
    return <FeedStoryBlock activity={activity} />;
  }

  if (activity.type === 'listen_sessions_summary') {
    return <ListenSessionsSummaryBlock activity={activity} />;
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
            href={activity.user?.id ? `/profile/${activity.user.id}` : '#'}
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
                href={activity.user?.id ? `/profile/${activity.user.id}` : '#'}
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
              {formatRelativeTime(activity.created_at)}
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
          href={activity.follower_id ? `/profile/${activity.follower_id}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {follower}
        </Link>
        {' followed '}
        <Link
          href={activity.following_id ? `/profile/${activity.following_id}` : '#'}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {following}
        </Link>
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {formatRelativeTime(activity.created_at)}
      </p>
    </article>
  );
}

export const FeedItem = memo(FeedItemInner);
