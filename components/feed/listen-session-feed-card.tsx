"use client";

import Link from "next/link";
import { useState, memo } from "react";
import { CatalogArtworkPlaceholder } from "@/components/catalog-artwork-placeholder";
import {
  ListenSessionRow,
  LISTEN_SESSIONS_DISPLAY_CAP,
} from "@/components/listen-session-row";
import { formatRelativeTime } from "@/lib/time";
import type { FeedListenSession } from "@/types";
import { StoryFeedCard } from "@/components/feed/story-feed-card";
import type { FeedListenSessionActivity } from "@/components/feed/group-feed-items";
import { FeedListenGroupEngagement } from "@/components/feed/feed-activity-engagement";

function albumHeroImage(session: FeedListenSessionActivity) {
  const url = session.album?.images?.[0]?.url;
  return url ?? null;
}

function sessionAlbumName(session: FeedListenSessionActivity) {
  return session.album?.name?.trim() || null;
}

function sessionTrackLabel(session: FeedListenSessionActivity) {
  return (
    session.track_name?.trim() ||
    session.album?.name?.trim() ||
    "Track"
  );
}

function sessionArtistLine(session: FeedListenSessionActivity) {
  return (
    session.artist_name?.trim() ||
    session.album?.artists?.map((a) => a.name).join(", ") ||
    ""
  );
}

export const ListenSessionSingleStoryCard = memo(function ListenSessionSingleStoryCard({
  activity,
}: {
  activity: FeedListenSessionActivity;
}) {
  const username = activity.user?.username ?? "Someone";
  const albumName = sessionAlbumName(activity) ?? sessionTrackLabel(activity);
  const trackLabel = sessionTrackLabel(activity);
  const artistLine = sessionArtistLine(activity);
  const image = albumHeroImage(activity);
  const time = formatRelativeTime(activity.created_at);
  const count = activity.song_count > 1 ? activity.song_count : null;

  return (
    <StoryFeedCard className="overflow-hidden">
      <Link
        href={`/album/${activity.album_id}`}
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <div className="relative h-[104px] w-full shrink-0 overflow-hidden bg-zinc-950 sm:h-[112px]">
          {image ? (
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
              <CatalogArtworkPlaceholder size="md" className="h-16 w-16 text-2xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Listening
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-bold leading-snug tracking-tight text-white sm:text-[17px]">
              <span className="font-semibold text-white">{username}</span>
              <span className="font-normal text-zinc-200"> is listening to </span>
              <span className="text-white">{albumName}</span>
            </h2>
            {trackLabel !== albumName ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-300">{trackLabel}</p>
            ) : null}
            {artistLine ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">{artistLine}</p>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-zinc-500 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={activity.user?.id ? `/profile/${activity.user.id}` : "#"}
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
                {username[0]?.toUpperCase() ?? "?"}
              </span>
            )}
          </Link>
          <span className="truncate tabular-nums">{time}</span>
        </div>
        {count != null ? (
          <span className="shrink-0 tabular-nums text-zinc-400">{count} plays</span>
        ) : null}
      </div>
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
  const first = sessions[0];
  const username = first.user?.username ?? "Someone";
  const n = sessions.length;
  const image = albumHeroImage(first);
  const time = formatRelativeTime(first.created_at);
  const displaySessions = sessions.slice(0, LISTEN_SESSIONS_DISPLAY_CAP);
  const showPlus = sessions.length > LISTEN_SESSIONS_DISPLAY_CAP;
  return (
    <>
    <StoryFeedCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80"
      >
        <div className="relative h-[104px] w-full shrink-0 overflow-hidden bg-zinc-950 sm:h-[112px]">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
              <CatalogArtworkPlaceholder size="md" className="h-16 w-16 text-2xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          {n > 1 ? (
            <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              +{n - 1}
            </div>
          ) : null}
          <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Session
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-bold leading-snug tracking-tight text-white sm:text-[17px]">
              <span className="font-semibold text-white">{username}</span>
              <span className="font-normal text-zinc-200"> listened to </span>
              <span className="text-white">{n} tracks</span>
            </h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-zinc-300">
              Starting with {sessionTrackLabel(first)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-zinc-500 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={first.user?.id ? `/profile/${first.user.id}` : "#"}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            >
              {first.user?.avatar_url ? (
                <img
                  src={first.user.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-medium text-zinc-200">
                  {username[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </Link>
            <span className="tabular-nums">{time}</span>
          </div>
          <span className="shrink-0 text-zinc-500" aria-hidden>
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </button>
      {expanded && displaySessions.length > 0 ? (
        <div className="border-t border-zinc-800/90 px-4 pb-4 pt-1">
          <ul className="mt-3 space-y-2">
            {displaySessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess as FeedListenSession} />
              </li>
            ))}
          </ul>
          {showPlus ? (
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              + more not shown
            </p>
          ) : null}
        </div>
      ) : null}
    </StoryFeedCard>
    <FeedListenGroupEngagement sessions={sessions} viewerUserId={viewerUserId} />
    </>
  );
});
