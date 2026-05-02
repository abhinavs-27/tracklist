'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
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
import { LikeReactionBar } from '@/components/reactions/like-reaction-bar';
import { CommentThread, CommentToggleButton } from '@/components/comment-thread';
import { formatStarDisplay } from '@/lib/ratings';

function StoryEngagement({ reactionTarget, commentTarget }: {
  reactionTarget: { targetType: string; targetId: string };
  commentTarget: { targetType: 'feed_item'; targetId: string };
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  return (
    <div className="border-t border-zinc-800/50 px-4">
      <div className="flex items-center gap-4 py-2">
        <LikeReactionBar target={reactionTarget} noTopBorder compact />
        <CommentToggleButton open={commentOpen} onToggle={() => setCommentOpen((o) => !o)} count={0} />
      </div>
      {commentOpen && (
        <CommentThread
          targetType={commentTarget.targetType}
          targetId={commentTarget.targetId}
          open={commentOpen}
          onOpenChange={setCommentOpen}
          bodyOnly
        />
      )}
    </div>
  );
}

function StoryAvatar({ user, username }: { user: { id?: string; avatar_url?: string | null } | null | undefined; username: string }) {
  return (
    <Link href={user?.id ? `/profile/${user.id}` : "#"} className="mt-0.5 shrink-0">
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 ring-1 ring-white/10">
          {username[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </Link>
  );
}

const ListenSessionsSummaryBlock = memo(function ListenSessionsSummaryBlock({
  activity,
}: {
  activity: Extract<FeedActivity, { type: 'listen_sessions_summary' }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const username = activity.user?.username ?? 'Someone';
  const n = activity.song_count;
  const time = formatRelativeTime(activity.created_at);
  const sessions = activity.sessions ?? [];
  const first = sessions[0];
  const reactionTarget = {
    targetType: "feed_listen_sessions_summary",
    targetId: `summary-${activity.user_id}-${activity.created_at}`,
  };

  return (
    <StoryFeedCard>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <StoryAvatar user={activity.user} username={username} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <Link href={activity.user?.id ? `/profile/${activity.user.id}` : "#"} className="font-semibold text-white hover:underline">
              {username}
            </Link>
            <span className="text-zinc-400"> listened to </span>
            <span className="font-medium text-white">{n} track{n !== 1 ? "s" : ""}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{time}</p>
        </div>
      </div>
      {sessions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-4 py-2 text-left text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            {expanded ? "Hide tracks ▲" : `Show ${n} track${n !== 1 ? "s" : ""} ▼`}
          </button>
          {expanded && (
            <div className="border-t border-zinc-800/60 px-4 pb-3 pt-2">
              <ul className="space-y-2">
                {sessions.slice(0, LISTEN_SESSIONS_DISPLAY_CAP).map((sess) => (
                  <li key={`${sess.track_id}-${sess.created_at}`}>
                    <ListenSessionRow session={sess} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <StoryEngagement
        reactionTarget={reactionTarget}
        commentTarget={{ targetType: 'feed_item', targetId: `summary-${activity.user_id}-${activity.created_at}` }}
      />
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
  const time = formatRelativeTime(activity.created_at);
  const profileHref = activity.user?.id ? `/profile/${activity.user.id}` : "#";
  const reactionTarget = { targetType: "feed_feed_story", targetId: activity.id };

  const actionLine = (() => {
    switch (activity.story_kind) {
      case "discovery": {
        const name = (p.artist_name as string) ?? "an artist";
        const id = p.artist_id as string | undefined;
        return (
          <span className="text-zinc-400">
            {" discovered "}
            {id ? (
              <Link href={`/artist/${id}`} className="font-medium text-white hover:text-emerald-400 hover:underline">{name}</Link>
            ) : (
              <span className="font-medium text-white">{name}</span>
            )}
          </span>
        );
      }
      case "top-artist-shift": {
        const name = (p.artist_name as string) ?? "an artist";
        const id = p.artist_id as string | undefined;
        return (
          <span className="text-zinc-400">
            {" is really into "}
            {id ? (
              <Link href={`/artist/${id}`} className="font-medium text-white hover:text-emerald-400 hover:underline">{name}</Link>
            ) : (
              <span className="font-medium text-white">{name}</span>
            )}{" lately"}
          </span>
        );
      }
      case "rating": {
        const title = (p.title as string) ?? "something";
        const et = p.entity_type as string;
        const eid = p.entity_id as string;
        const rating = Number(p.rating) || 0;
        const href = et === "album" ? `/album/${eid}` : et === "song" ? `/song/${eid}` : "#";
        return (
          <span className="text-zinc-400">
            {" rated "}
            <Link href={href} className="font-medium text-white hover:text-emerald-400 hover:underline">{title}</Link>
            <span className="ml-1.5 text-amber-400/90">{formatStarDisplay(rating)}</span>
          </span>
        );
      }
      case "streak": {
        const days = Number(p.days) || 0;
        return <span className="text-zinc-400">{` is on a `}<span className="font-medium text-white">{days}-day</span>{` listening streak 🔥`}</span>;
      }
      case "binge": {
        const count = Number(p.log_count) || 0;
        return <span className="text-zinc-400">{` went on a binge`}{count > 0 ? ` · ${count} songs` : ""}</span>;
      }
      case "new-list": {
        const title = (p.title as string) ?? "a list";
        const lid = p.list_id as string | undefined;
        return (
          <span className="text-zinc-400">
            {" created "}
            {lid ? (
              <Link href={`/lists/${lid}`} className="font-medium text-white hover:text-emerald-400 hover:underline">{title}</Link>
            ) : (
              <span className="font-medium text-white">{title}</span>
            )}
          </span>
        );
      }
      case "milestone": {
        const m = p.milestone as number | undefined;
        return <span className="text-zinc-400">{` hit `}<span className="font-medium text-white">{m?.toLocaleString() ?? ""}</span>{` total listens`}</span>;
      }
      default:
        return null;
    }
  })();

  return (
    <StoryFeedCard>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <StoryAvatar user={activity.user} username={username} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <Link href={profileHref} className="font-semibold text-white hover:underline">{username}</Link>
            {actionLine}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{time}</p>
        </div>
      </div>
      <StoryEngagement
        reactionTarget={reactionTarget}
        commentTarget={{ targetType: 'feed_item', targetId: activity.id }}
      />
    </StoryFeedCard>
  );
});

function FeedItemInner({ activity, spotifyName, viewerUserId }: FeedItemProps) {
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
    return <ListenSessionSingleStoryCard activity={activity} viewerUserId={viewerUserId} />;
  }

  // Follow card
  const follower = activity.follower_username ?? 'Someone';
  const following = activity.following_username ?? 'someone';

  return (
    <StoryFeedCard>
      <div className="flex items-start gap-3 px-4 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 ring-1 ring-white/10">
          {follower[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <Link href={activity.follower_id ? `/profile/${activity.follower_id}` : '#'} className="font-semibold text-white hover:underline">
              {follower}
            </Link>
            <span className="text-zinc-400"> followed </span>
            <Link href={activity.following_id ? `/profile/${activity.following_id}` : '#'} className="font-semibold text-white hover:underline">
              {following}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            {formatRelativeTime(activity.created_at)}
          </p>
        </div>
      </div>
    </StoryFeedCard>
  );
}

export const FeedItem = memo(FeedItemInner);
