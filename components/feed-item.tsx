'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { CatalogArtworkPlaceholder } from '@/components/catalog-artwork-placeholder';
import {
  ListenSessionRow,
  LISTEN_SESSIONS_DISPLAY_CAP,
} from "@/components/listen-session-row";
import { ReviewCard } from './review-card';
import { formatRelativeTime } from '@/lib/time';
import type { FeedActivity } from '@/types';
import { StoryFeedCard } from '@/components/feed/story-feed-card';
import { ListenSessionSingleStoryCard } from '@/components/feed/listen-session-feed-card';

const ListenSessionsSummaryBlock = memo(function ListenSessionsSummaryBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: 'listen_sessions_summary' }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const username = activity.user?.username ?? 'Someone';
  const songCount = activity.song_count;
  const displayCount = Math.min(songCount, LISTEN_SESSIONS_DISPLAY_CAP);
  const showPlus = songCount > LISTEN_SESSIONS_DISPLAY_CAP;
  const timeAgo = formatRelativeTime(activity.created_at);
  const sessions = activity.sessions ?? [];
  const first = sessions[0];
  const heroUrl = first?.album?.images?.[0]?.url ?? null;

  return (
    <StoryFeedCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-950">
          {heroUrl ? (
            <img src={heroUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
              <CatalogArtworkPlaceholder size="lg" className="h-24 w-24 text-4xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Listening
            </p>
            <h2 className="mt-1 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
              <span className="font-semibold text-white">{username}</span>
              <span className="font-normal text-zinc-200"> listened to </span>
              <span className="text-white">
                {displayCount}{showPlus ? '+' : ''} song{(displayCount !== 1 || showPlus) ? 's' : ''}
              </span>
            </h2>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-xs text-zinc-500">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={activity.user?.id ? `/profile/${activity.user.id}` : '#'}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            >
              {activity.user?.avatar_url ? (
                <img
                  src={activity.user.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-200">
                  {username[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </Link>
            <span className="tabular-nums">{timeAgo}</span>
          </div>
          <span className="shrink-0 text-zinc-500" aria-hidden>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </button>
      {expanded && sessions.length > 0 && (
        <div className="border-t border-zinc-800/90 px-4 pb-4 pt-1">
          <ul className="mt-3 space-y-2">
            {sessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </StoryFeedCard>
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" discovered "}
            {id ? (
              <Link href={`/artist/${id}`} className="text-white hover:text-emerald-400 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-zinc-100">{name}</span>
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" is really into "}
            {id ? (
              <Link href={`/artist/${id}`} className="text-white hover:text-emerald-400 hover:underline">
                {name}
              </Link>
            ) : (
              <span className="text-zinc-100">{name}</span>
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" rated "}
            <Link href={href} className="text-white hover:text-emerald-400 hover:underline">
              {title}
            </Link>
            <span className="ml-2 text-amber-400/95" aria-label={`${rating} stars`}>
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
            >
              {username}
            </Link>
            {" created a list: "}
            {lid ? (
              <Link href={`/lists/${lid}`} className="text-white hover:text-emerald-400 hover:underline">
                {title}
              </Link>
            ) : (
              <span className="text-zinc-100">{title}</span>
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
              className="font-semibold text-white hover:text-emerald-400 hover:underline"
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
    <StoryFeedCard className="overflow-hidden">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
        <div className="absolute inset-0 flex items-center justify-center py-10">
          <Link
            href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
            className="relative z-10"
          >
            {activity.user?.avatar_url ? (
              <img
                src={activity.user.avatar_url}
                alt=""
                className="h-28 w-28 rounded-full border-4 border-zinc-700/80 object-cover shadow-xl shadow-black/40 sm:h-32 sm:w-32"
              />
            ) : (
              <span className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-zinc-700/80 bg-zinc-800 text-3xl font-semibold text-zinc-200 shadow-xl sm:h-32 sm:w-32">
                {username[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>
      <div className="px-5 pb-5 pt-5">
        <h2 className="text-lg font-bold leading-snug tracking-tight text-white sm:text-xl">
          {headline}
        </h2>
        <p className="mt-3 text-xs text-zinc-500">
          <span className="text-zinc-500">{kindLabel}</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="tabular-nums">{timeAgo}</span>
        </p>
      </div>
    </StoryFeedCard>
  );
});

function FeedItemInner({ activity, spotifyName }: FeedItemProps) {
  if (activity.type === 'review') {
    return (
      <StoryFeedCard>
        <ReviewCard review={activity.review} spotifyName={spotifyName} variant="story" />
      </StoryFeedCard>
    );
  }

  if (activity.type === 'feed_story') {
    return <FeedStoryBlock activity={activity} />;
  }

  if (activity.type === 'listen_sessions_summary') {
    return <ListenSessionsSummaryBlock activity={activity} />;
  }

  if (activity.type === 'listen_session') {
    return <ListenSessionSingleStoryCard activity={activity} />;
  }

  const follower = activity.follower_username ?? 'Someone';
  const following = activity.following_username ?? 'someone';

  return (
    <StoryFeedCard className="overflow-hidden">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950">
        <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
          <Link
            href={activity.follower_id ? `/profile/${activity.follower_id}` : '#'}
            className="relative z-10"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-zinc-600 bg-zinc-800 text-2xl font-semibold text-zinc-200 shadow-lg sm:h-24 sm:w-24">
              {follower[0]?.toUpperCase() ?? '?'}
            </span>
          </Link>
          <span className="text-2xl text-zinc-600" aria-hidden>
            →
          </span>
          <Link
            href={activity.following_id ? `/profile/${activity.following_id}` : '#'}
            className="relative z-10"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-700/50 bg-zinc-800 text-2xl font-semibold text-zinc-200 shadow-lg sm:h-24 sm:w-24">
              {following[0]?.toUpperCase() ?? '?'}
            </span>
          </Link>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>
      <div className="px-5 pb-5 pt-5">
        <h2 className="text-lg font-bold leading-snug tracking-tight text-white sm:text-xl">
          <Link
            href={activity.follower_id ? `/profile/${activity.follower_id}` : '#'}
            className="hover:text-emerald-400 hover:underline"
          >
            {follower}
          </Link>
          <span className="font-normal text-zinc-400"> followed </span>
          <Link
            href={activity.following_id ? `/profile/${activity.following_id}` : '#'}
            className="hover:text-emerald-400 hover:underline"
          >
            {following}
          </Link>
        </h2>
        <p className="mt-3 text-xs text-zinc-500 tabular-nums">
          {formatRelativeTime(activity.created_at)}
        </p>
      </div>
    </StoryFeedCard>
  );
}

export const FeedItem = memo(FeedItemInner);
