"use client";

import Link from "next/link";
import { useState, memo } from "react";
import { ListenSessionRow, LISTEN_SESSIONS_DISPLAY_CAP } from "@/components/listen-session-row";
import { formatRelativeTime } from "@/lib/time";
import type { FeedListenSession } from "@/types";
import { StoryFeedCard } from "@/components/feed/story-feed-card";
import type { FeedListenSessionActivity } from "@/components/feed/group-feed-items";
import { LikeReactionBar } from "@/components/reactions/like-reaction-bar";
import { CommentThread, CommentToggleButton } from "@/components/comment-thread";
import { feedAlbumCoverUrl } from "@/lib/feed-artwork";

function art(s: FeedListenSessionActivity) {
  return feedAlbumCoverUrl(s.album ?? undefined);
}

function albumName(s: FeedListenSessionActivity) {
  return s.album?.name?.trim() || null;
}

function artistName(s: FeedListenSessionActivity) {
  return s.artist_name?.trim() || s.album?.artists?.map((a) => a.name).join(", ") || null;
}

function Avatar({ user, username }: { user: FeedListenSessionActivity["user"]; username: string }) {
  return (
    <Link href={user?.id ? `/profile/${user.id}` : "#"} className="shrink-0" onClick={(e) => e.stopPropagation()}>
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200 ring-1 ring-white/10">
          {username[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </Link>
  );
}

function AlbumThumb({ src, href }: { src: string | null; href: string }) {
  return (
    <Link href={href} className="group shrink-0">
      <div className="h-[72px] w-[72px] overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.07]">
        {src ? (
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}
      </div>
    </Link>
  );
}

function EngagementRow({ reactionTarget, commentTarget }: {
  reactionTarget: { targetType: string; targetId: string };
  commentTarget: { targetType: "feed_item"; targetId: string };
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentCount] = useState(0);
  return (
    <div className="border-t border-zinc-800/50 px-4">
      {/* Only icon buttons in the flex row — expansion never grows inside here */}
      <div className="flex items-center gap-4 py-2">
        <LikeReactionBar target={reactionTarget} noTopBorder compact />
        <CommentToggleButton
          open={commentOpen}
          onToggle={() => setCommentOpen((o) => !o)}
          count={commentCount}
        />
      </div>
      {/* Thread body renders below the button row, completely outside the flex */}
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

export const ListenSessionSingleStoryCard = memo(function ListenSessionSingleStoryCard({
  activity,
  viewerUserId,
}: {
  activity: FeedListenSessionActivity;
  viewerUserId?: string;
}) {
  const username = activity.user?.username ?? "Someone";
  const artUrl = art(activity);
  const album = albumName(activity);
  const artist = artistName(activity);
  const time = formatRelativeTime(activity.created_at);
  const albumHref = `/album/${activity.album_id}`;
  const reactionTarget = {
    targetType: "feed_listen_session",
    targetId: `${activity.user_id}-${activity.album_id}-${activity.created_at}`,
  };
  const commentTarget = {
    targetType: "feed_item" as const,
    targetId: `${activity.user_id}-${activity.album_id}-${activity.created_at}`,
  };

  return (
    <StoryFeedCard>
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar user={activity.user} username={username} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <Link href={activity.user?.id ? `/profile/${activity.user.id}` : "#"} className="font-semibold text-white hover:underline">
              {username}
            </Link>
            <span className="text-zinc-400"> listened to</span>
          </p>
          {album && (
            <Link href={albumHref} className="mt-1 block text-sm font-medium text-white hover:text-gold-400 hover:underline">
              {album}
            </Link>
          )}
          {artist && <p className="mt-0.5 text-xs text-zinc-500">{artist}</p>}
          <p className="mt-0.5 text-xs text-zinc-600 tabular-nums">{time}</p>
        </div>
        <AlbumThumb src={artUrl} href={albumHref} />
      </div>
      <EngagementRow reactionTarget={reactionTarget} commentTarget={commentTarget} />
    </StoryFeedCard>
  );
});

export const ListenSessionGroupStoryCard = memo(function ListenSessionGroupStoryCard({
  sessions,
  viewerUserId,
}: {
  sessions: FeedListenSessionActivity[];
  viewerUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = sessions[0]!;
  const username = first.user?.username ?? "Someone";
  const n = sessions.length;
  const artUrl = art(first);
  const album = albumName(first);
  const artist = artistName(first);
  const time = formatRelativeTime(first.created_at);
  const albumHref = `/album/${first.album_id}`;
  const displaySessions = sessions.slice(0, LISTEN_SESSIONS_DISPLAY_CAP);
  const reactionTarget = {
    targetType: "feed_listen_session",
    targetId: `${first.user_id}-${first.album_id}-${first.created_at}`,
  };
  const commentTarget = {
    targetType: "feed_item" as const,
    targetId: `${first.user_id}-${first.album_id}-${first.created_at}`,
  };

  return (
    <StoryFeedCard>
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar user={first.user} username={username} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <Link href={first.user?.id ? `/profile/${first.user.id}` : "#"} className="font-semibold text-white hover:underline">
              {username}
            </Link>
            <span className="text-zinc-400"> listened to </span>
            <span className="font-medium text-white">{n} tracks</span>
          </p>
          {album && (
            <Link href={albumHref} className="mt-1 block text-sm font-medium text-white hover:text-gold-400 hover:underline">
              {album}
            </Link>
          )}
          {artist && <p className="mt-0.5 text-xs text-zinc-500">{artist}</p>}
          <p className="mt-0.5 text-xs text-zinc-600 tabular-nums">{time}</p>
        </div>
        <AlbumThumb src={artUrl} href={albumHref} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-1.5 text-left text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        {expanded ? "Hide tracks ▲" : `${n} tracks ▼`}
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/60 px-4 pb-3 pt-2">
          <ul className="space-y-1.5">
            {displaySessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess as FeedListenSession} />
              </li>
            ))}
          </ul>
          {sessions.length > LISTEN_SESSIONS_DISPLAY_CAP && (
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              + {sessions.length - LISTEN_SESSIONS_DISPLAY_CAP} more
            </p>
          )}
        </div>
      )}

      <EngagementRow reactionTarget={reactionTarget} commentTarget={commentTarget} />
    </StoryFeedCard>
  );
});
