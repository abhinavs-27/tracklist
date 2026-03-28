"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMUNITY_FEED_PAGE_SIZE } from "@/lib/community/community-feed-page-size";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { CommunityFeedCommentThread } from "@/components/community/community-feed-comment-thread";
import {
  ListenSessionRow,
  LISTEN_SESSIONS_DISPLAY_CAP,
} from "@/components/listen-session-row";
import { formatRelativeTime } from "@/lib/time";
import type { FeedListenSession } from "@/types";

type Filter = "all" | "streaks" | "listens" | "reviews" | "members";

function CommunityListenSessionsSummaryCard(props: {
  item: CommunityFeedItemV2;
  communityId: string;
}) {
  const { item, communityId } = props;
  const [expanded, setExpanded] = useState(false);
  const payload = item.payload as {
    song_count?: number;
    sessions?: FeedListenSession[];
  };
  const songCount = Number(payload.song_count) || 0;
  const sessions = payload.sessions ?? [];
  const displayCount = Math.min(songCount, LISTEN_SESSIONS_DISPLAY_CAP);
  const showPlus = songCount > LISTEN_SESSIONS_DISPLAY_CAP;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
      <div className="flex gap-3">
        <Link
          href={`/profile/${item.user_id}`}
          className="inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              {item.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full text-left"
          >
            <p className="text-sm text-zinc-300">
              <Link
                href={`/profile/${item.user_id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-white hover:text-emerald-400 hover:underline"
              >
                {item.username}
              </Link>
              {" listened to "}
              <span className="text-zinc-400">
                {displayCount}
                {showPlus ? "+" : ""} song
                {displayCount !== 1 || showPlus ? "s" : ""}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatRelativeTime(item.created_at)}
              <span className="ml-1 text-zinc-600">{expanded ? "▼" : "▶"}</span>
            </p>
          </button>
        </div>
        {item.artwork_url ? (
          <img
            src={item.artwork_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-zinc-700 object-cover"
          />
        ) : null}
      </div>
      {expanded && sessions.length > 0 ? (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {sessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 border-t border-zinc-800/80 pt-3">
        <CommunityFeedCommentThread
          communityId={communityId}
          {...commentThreadTarget(item)}
          initialCount={item.comment_count}
        />
      </div>
    </article>
  );
}

function commentThreadTarget(item: CommunityFeedItemV2): {
  targetType: "review" | "log" | "feed_item";
  targetId: string;
} {
  if (item.review_id) {
    return { targetType: "review", targetId: item.review_id };
  }
  if (item.log_id) {
    return { targetType: "log", targetId: item.log_id };
  }
  return { targetType: "feed_item", targetId: item.id };
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "listens", label: "Listens" },
  { value: "reviews", label: "Reviews" },
  { value: "streaks", label: "Streaks" },
  { value: "members", label: "Members" },
];

export function CommunityFeedClient(props: {
  communityId: string;
  initialItems: CommunityFeedItemV2[];
  initialNextOffset?: number | null;
}) {
  const pageSize = COMMUNITY_FEED_PAGE_SIZE;
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CommunityFeedItemV2[]>(props.initialItems);
  const [nextOffset, setNextOffset] = useState<number | null>(
    props.initialNextOffset ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const skipFirstLoad = useRef(true);
  const filterRef = useRef<Filter>("all");
  const feedTopRef = useRef<HTMLDivElement>(null);
  filterRef.current = filter;

  const fetchPage = useCallback(
    async (targetPage: number, f: Filter) => {
      const offset = (targetPage - 1) * pageSize;
      const res = await fetch(
        `/api/communities/${props.communityId}/feed?offset=${offset}&filter=${encodeURIComponent(f)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        feed?: CommunityFeedItemV2[];
        next_offset?: number | null;
      };
    },
    [props.communityId, pageSize],
  );

  const applyFeedResponse = useCallback(
    (data: { feed?: CommunityFeedItemV2[]; next_offset?: number | null } | null) => {
      if (!data) return;
      setItems(data.feed ?? []);
      setNextOffset(data.next_offset ?? null);
    },
    [],
  );

  const load = useCallback(
    async (f: Filter) => {
      setLoading(true);
      setPage(1);
      try {
        const data = await fetchPage(1, f);
        applyFeedResponse(data);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, applyFeedResponse],
  );

  const goToPage = useCallback(
    async (targetPage: number) => {
      if (targetPage < 1 || navLoading || loading) return;
      if (targetPage === page) return;
      setNavLoading(true);
      try {
        const data = await fetchPage(targetPage, filter);
        applyFeedResponse(data);
        setPage(targetPage);
        feedTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } finally {
        setNavLoading(false);
      }
    },
    [fetchPage, applyFeedResponse, filter, page, navLoading, loading],
  );

  const goNext = useCallback(() => {
    if (nextOffset == null || navLoading || loading) return;
    void goToPage(page + 1);
  }, [nextOffset, navLoading, loading, goToPage, page]);

  const goPrev = useCallback(() => {
    if (page <= 1 || navLoading || loading) return;
    void goToPage(page - 1);
  }, [page, navLoading, loading, goToPage]);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    let cancelled = false;
    let ch: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        const { supabase } = await import("@/lib/supabase-client");
        const channel = supabase
          .channel(`community-feed:${props.communityId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_feed",
              filter: `community_id=eq.${props.communityId}`,
            },
            () => {
              if (!cancelled) void load(filterRef.current);
            },
          )
          .subscribe();
        ch = { unsubscribe: () => void supabase.removeChannel(channel) };
      } catch {
        /* missing env */
      }
    })();

    return () => {
      cancelled = true;
      ch?.unsubscribe();
    };
  }, [props.communityId, load]);

  useEffect(() => {
    setItems(props.initialItems);
    setNextOffset(props.initialNextOffset ?? null);
    setPage(1);
  }, [props.communityId]);

  const hasNextPage = nextOffset != null;

  return (
    <div ref={feedTopRef} className="pr-1 scroll-mt-4">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.value
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No activity for this filter yet. Member listens, reviews, follows, feed stories,
          and milestones appear here.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-4 p-0">
          {items.map((item) => {
            if (item.event_type === "listen_sessions_summary") {
              return (
                <li key={item.id}>
                  <CommunityListenSessionsSummaryCard
                    item={item}
                    communityId={props.communityId}
                  />
                </li>
              );
            }

            const isReview = item.event_type === "review";
            const rating = Number(item.payload?.rating) || 0;
            const showEntityLink =
              isReview && item.entity_href && item.entity_name;
            const isFullLineLabel =
              item.event_type === "feed_story" ||
              item.event_type === "community_follow";

            return (
              <li key={item.id}>
                <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:bg-zinc-900/70">
                <div className="flex gap-3">
                  <Link
                    href={`/profile/${item.user_id}`}
                    className="inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800"
                  >
                    {item.avatar_url ? (
                      <img
                        src={item.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                        {item.username[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    {showEntityLink ? (
                      <p className="text-sm text-zinc-200">
                        <Link
                          href={`/profile/${item.user_id}`}
                          className="font-medium text-white hover:text-emerald-400 hover:underline"
                        >
                          {item.username}
                        </Link>
                        <span className="text-zinc-400"> · </span>
                        <span>Rated </span>
                        <Link
                          href={item.entity_href!}
                          className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
                        >
                          {item.entity_name}
                        </Link>
                        <span className="text-zinc-300">
                          {" "}
                          {rating}/5
                        </span>
                      </p>
                    ) : isFullLineLabel ? (
                      <p className="text-sm leading-relaxed text-zinc-200">
                        {item.label}
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-200">
                        <Link
                          href={`/profile/${item.user_id}`}
                          className="font-medium text-white hover:text-emerald-400 hover:underline"
                        >
                          {item.username}
                        </Link>
                        <span className="text-zinc-400"> · </span>
                        <span>{item.label}</span>
                      </p>
                    )}
                    {item.sublabel ? (
                      <p className="mt-0.5 line-clamp-3 text-xs text-zinc-500">
                        {item.sublabel}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </div>
                  {item.artwork_url ? (
                    item.entity_href ? (
                      <Link
                        href={item.entity_href}
                        className="shrink-0"
                        aria-label="Open album or track"
                      >
                        <img
                          src={item.artwork_url}
                          alt=""
                          className="h-14 w-14 rounded-md border border-zinc-700 object-cover transition hover:opacity-90"
                        />
                      </Link>
                    ) : (
                      <img
                        src={item.artwork_url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-md border border-zinc-700 object-cover"
                      />
                    )
                  ) : null}
                </div>
                <div className="mt-3 border-t border-zinc-800/80 pt-3">
                  <CommunityFeedCommentThread
                    communityId={props.communityId}
                    {...commentThreadTarget(item)}
                    initialCount={item.comment_count}
                  />
                </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && items.length > 0 ? (
        <div className="flex items-center justify-between gap-4 pt-4">
          <button
            type="button"
            onClick={() => void goPrev()}
            disabled={page <= 1 || navLoading}
            className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {navLoading ? "Loading…" : "Previous"}
          </button>
          <span className="text-sm tabular-nums text-zinc-500">Page {page}</span>
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!hasNextPage || navLoading}
            className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {navLoading ? "Loading…" : "Next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
