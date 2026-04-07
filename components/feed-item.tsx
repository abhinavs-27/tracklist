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
import type { EnrichedFeedActivity } from '@/components/feed/group-feed-items';
import { FeedActivityEngagement } from '@/components/feed/feed-activity-engagement';
import { formatStarDisplay } from '@/lib/ratings';

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
        <div className="relative h-[104px] w-full shrink-0 overflow-hidden bg-zinc-950 sm:h-[112px]">
          {heroUrl ? (
            <img src={heroUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
              <CatalogArtworkPlaceholder size="lg" className="h-16 w-16 text-2xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Listening
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-bold leading-snug tracking-tight text-white sm:text-[17px]">
              <span className="font-semibold text-white">{username}</span>
              <span className="font-normal text-zinc-200"> listened to </span>
              <span className="text-white">
                {displayCount}{showPlus ? '+' : ''} song{(displayCount !== 1 || showPlus) ? 's' : ''}
              </span>
            </h2>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-zinc-500 sm:px-4">
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
                  className="h-7 w-7 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-medium text-zinc-200">
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
  viewerUserId: string;
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
              {formatStarDisplay(rating)}
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
      <div className="relative h-[104px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 sm:h-[112px]">
        <div className="absolute inset-0 flex items-center justify-center py-4">
          <Link
            href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
            className="relative z-10"
          >
            {activity.user?.avatar_url ? (
              <img
                src={activity.user.avatar_url}
                alt=""
                className="h-[72px] w-[72px] rounded-full border-[3px] border-zinc-700/80 object-cover shadow-lg shadow-black/40 sm:h-20 sm:w-20"
              />
            ) : (
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-zinc-700/80 bg-zinc-800 text-xl font-semibold text-zinc-200 shadow-lg sm:h-20 sm:w-20 sm:text-2xl">
                {username[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>
      <div className="px-4 pb-3 pt-3 sm:px-5">
        <h2 className="text-base font-bold leading-snug tracking-tight text-white sm:text-lg">
          {headline}
        </h2>
        <p className="mt-2 text-[11px] text-zinc-500">
          <span className="text-zinc-500">{kindLabel}</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="tabular-nums">{timeAgo}</span>
        </p>
      </div>
    </StoryFeedCard>
  );
});

function FeedItemInner({ activity, spotifyName, viewerUserId }: FeedItemProps) {
  if (activity.type === 'review') {
    return (
      <>
        <StoryFeedCard>
          <ReviewCard review={activity.review} spotifyName={spotifyName} variant="story" />
        </StoryFeedCard>
        <FeedActivityEngagement activity={activity as EnrichedFeedActivity} viewerUserId={viewerUserId} />
      </>
    );
  }

  if (activity.type === 'feed_story') {
    return (
      <>
        <FeedStoryBlock activity={activity} />
        <FeedActivityEngagement activity={activity as EnrichedFeedActivity} viewerUserId={viewerUserId} />
      </>
    );
  }

  if (activity.type === 'listen_sessions_summary') {
    return (
      <>
        <ListenSessionsSummaryBlock activity={activity} />
        <FeedActivityEngagement activity={activity as EnrichedFeedActivity} viewerUserId={viewerUserId} />
      </>
    );
  }

  if (activity.type === 'listen_session') {
    return (
      <>
        <ListenSessionSingleStoryCard activity={activity} />
        <FeedActivityEngagement activity={activity as EnrichedFeedActivity} viewerUserId={viewerUserId} />
      </>
    );
  }

  const follower = activity.follower_username ?? 'Someone';
  const following = activity.following_username ?? 'someone';

  return (
    <>
      <StoryFeedCard className="overflow-hidden">
        <div className="relative h-[104px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 sm:h-[112px]">
          <div className="absolute inset-0 flex items-center justify-center gap-2 px-3 sm:gap-3 sm:px-5">
            <Link
              href={activity.follower_id ? `/profile/${activity.follower_id}` : '#'}
              className="relative z-10"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-zinc-600 bg-zinc-800 text-lg font-semibold text-zinc-200 shadow-lg sm:h-16 sm:w-16 sm:text-xl">
                {follower[0]?.toUpperCase() ?? '?'}
              </span>
            </Link>
            <span className="text-lg text-zinc-600 sm:text-xl" aria-hidden>
              →
            </span>
            <Link
              href={activity.following_id ? `/profile/${activity.following_id}` : '#'}
              className="relative z-10"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-700/50 bg-zinc-800 text-lg font-semibold text-zinc-200 shadow-lg sm:h-16 sm:w-16 sm:text-xl">
                {following[0]?.toUpperCase() ?? '?'}
              </span>
            </Link>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
        </div>
        <div className="px-4 pb-3 pt-3 sm:px-5">
          <h2 className="text-base font-bold leading-snug tracking-tight text-white sm:text-lg">
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
          <p className="mt-2 text-[11px] text-zinc-500 tabular-nums">
            {formatRelativeTime(activity.created_at)}
          </p>
        </div>
      </StoryFeedCard>
      <FeedActivityEngagement activity={activity as EnrichedFeedActivity} viewerUserId={viewerUserId} />
    </>
  );
}

export const FeedItem = memo(FeedItemInner);
