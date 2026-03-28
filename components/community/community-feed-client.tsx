"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMUNITY_FEED_PAGE_SIZE } from "@/lib/community/community-feed-page-size";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { buildLiveFeedRows } from "@/lib/community/community-feed-live-grouping";
import { CommunityFeedCommentThread } from "@/components/community/community-feed-comment-thread";
import {
  ListenSessionRow,
  LISTEN_SESSIONS_DISPLAY_CAP,
} from "@/components/listen-session-row";
import { formatRelativeTime } from "@/lib/time";
import {
  communityBody,
  communityFeedCard,
  communityFeedCardTrending,
  communityHeadline,
  communityMeta,
  communityMetaLabel,
  communityButton,
} from "@/lib/ui/surface";
import type { FeedListenSession } from "@/types";

type Filter = "all" | "streaks" | "listens" | "reviews" | "members";

function CommunityListenSessionsSummaryCard(props: {
  item: CommunityFeedItemV2;
  communityId: string;
  trending?: boolean;
}) {
  const { item, communityId, trending } = props;
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
    <article
      className={`${trending ? communityFeedCardTrending : communityFeedCard} hover:bg-zinc-900/65`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <Link
          href={`/profile/${item.user_id}`}
          className="inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
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
            <p className={`${communityBody} text-zinc-200`}>
              <Link
                href={`/profile/${item.user_id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-white hover:text-emerald-400 hover:underline"
              >
                {item.username}
              </Link>
              <span className="font-normal text-zinc-400">
                {" "}
                listened to{" "}
                <span className="text-zinc-300">
                  {displayCount}
                  {showPlus ? "+" : ""} song
                  {displayCount !== 1 || showPlus ? "s" : ""}
                </span>
              </span>
            </p>
            <p className={`mt-1.5 ${communityMeta}`}>
              {formatRelativeTime(item.created_at)}
              <span className="ml-1 text-zinc-600">{expanded ? "▼" : "▶"}</span>
            </p>
          </button>
        </div>
        {item.artwork_url ? (
          <img
            src={item.artwork_url}
            alt=""
            className={`h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:h-[5.5rem] sm:w-[5.5rem] ${trending ? "ring-emerald-500/30" : ""}`}
          />
        ) : null}
      </div>
      {expanded && sessions.length > 0 ? (
        <div className="mt-5 pt-4">
          <ul className="m-0 list-none space-y-2.5 p-0">
            {sessions.map((sess) => (
              <li key={`${sess.track_id}-${sess.created_at}`}>
                <ListenSessionRow session={sess} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5 pt-5">
        <CommunityFeedCommentThread
          communityId={communityId}
          {...commentThreadTarget(item)}
          initialCount={item.comment_count}
        />
      </div>
    </article>
  );
}

function AlbumListenClusterCard(props: {
  albumId: string;
  uniqueUserCount: number;
  latestAt: string;
  artworkUrl: string | null;
  sampleItems: CommunityFeedItemV2[];
}) {
  const { albumId, uniqueUserCount, latestAt, artworkUrl, sampleItems } = props;
  const avatars = sampleItems.slice(0, 4);

  return (
    <article
      className={`${communityFeedCard} bg-gradient-to-br from-zinc-900/80 via-zinc-950/90 to-zinc-950 hover:from-zinc-900/90`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="relative shrink-0">
          {artworkUrl ? (
            <Link href={`/album/${albumId}`} className="block">
              <img
                src={artworkUrl}
                alt=""
                className="h-28 w-28 rounded-2xl object-cover shadow-lg shadow-black/40 ring-1 ring-white/[0.08] sm:h-32 sm:w-32"
              />
            </Link>
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-zinc-900/60 text-zinc-600 ring-1 ring-dashed ring-zinc-600/80 sm:h-32 sm:w-32">
              <span className={communityMeta}>Album</span>
            </div>
          )}
          <span
            className={`absolute -bottom-1 -right-1 rounded-full bg-emerald-600 px-2 py-0.5 font-semibold uppercase tracking-wide text-white shadow-md ${communityMeta}`}
          >
            Live
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className={`font-semibold leading-snug text-white ${communityHeadline}`}>
            <span className="text-emerald-400/95">{uniqueUserCount}</span>{" "}
            {uniqueUserCount === 1 ? "person is" : "people are"} listening to{" "}
            <Link
              href={`/album/${albumId}`}
              className="text-white underline decoration-emerald-500/50 underline-offset-2 transition hover:text-emerald-300"
            >
              this album
            </Link>
          </p>
          <p className={communityMeta}>{formatRelativeTime(latestAt)}</p>
          <div className="flex -space-x-2">
            {avatars.map((u) => (
              <Link
                key={u.user_id + u.id}
                href={`/profile/${u.user_id}`}
                title={u.username}
                className="inline-flex h-9 w-9 overflow-hidden rounded-full border-2 border-zinc-950 bg-zinc-800 ring-1 ring-zinc-700"
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className={`flex h-full w-full items-center justify-center text-zinc-400 ${communityMeta}`}>
                    {u.username[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
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

function LiveFeedItemCard(props: {
  item: CommunityFeedItemV2;
  communityId: string;
  trending: boolean;
}) {
  const { item, communityId, trending } = props;
  const isReview = item.event_type === "review";
  const rating = Number(item.payload?.rating) || 0;
  const showEntityLink = isReview && item.entity_href && item.entity_name;
  const isFullLineLabel =
    item.event_type === "feed_story" || item.event_type === "community_follow";

  return (
    <article
      className={`${trending ? communityFeedCardTrending : communityFeedCard} hover:bg-zinc-900/70`}
    >
      {trending ? (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.12em] text-emerald-400/95 ring-1 ring-emerald-500/25">
          Trending
        </div>
      ) : null}
      <div className="flex gap-4">
        <Link
          href={`/profile/${item.user_id}`}
          className="inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10"
        >
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
              {item.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          {showEntityLink ? (
            <p className={`${communityBody} text-zinc-200`}>
              <Link
                href={`/profile/${item.user_id}`}
                className="font-semibold text-white hover:text-emerald-400 hover:underline"
              >
                {item.username}
              </Link>
              <span className="text-zinc-500"> · </span>
              <span>Rated </span>
              <Link
                href={item.entity_href!}
                className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                {item.entity_name}
              </Link>
              <span className="text-zinc-300"> {rating}/5</span>
            </p>
          ) : isFullLineLabel ? (
            <p className={`${communityBody} leading-relaxed text-zinc-200`}>{item.label}</p>
          ) : (
            <p className={`${communityBody} text-zinc-200`}>
              <Link
                href={`/profile/${item.user_id}`}
                className="font-semibold text-white hover:text-emerald-400 hover:underline"
              >
                {item.username}
              </Link>
              <span className="text-zinc-500"> · </span>
              <span>{item.label}</span>
            </p>
          )}
          {item.sublabel ? (
            <p className={`mt-1.5 line-clamp-4 ${communityMeta}`}>
              {item.sublabel}
            </p>
          ) : null}
          <p className={`mt-2 ${communityMeta}`}>
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
                className={`h-20 w-20 rounded-xl object-cover ring-1 ring-white/10 transition hover:opacity-90 sm:h-[5.5rem] sm:w-[5.5rem] ${trending ? "ring-emerald-500/35" : ""}`}
              />
            </Link>
          ) : (
            <img
              src={item.artwork_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:h-[5.5rem] sm:w-[5.5rem]"
            />
          )
        ) : null}
      </div>
      <div className="mt-5 pt-5">
        <CommunityFeedCommentThread
          communityId={communityId}
          {...commentThreadTarget(item)}
          initialCount={item.comment_count}
        />
      </div>
    </article>
  );
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
  const reduceMotion = useReducedMotion();
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

  const rows = useMemo(() => buildLiveFeedRows(items, filter), [items, filter]);

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
  }, [props.communityId, props.initialItems, props.initialNextOffset]);

  const hasNextPage = nextOffset != null;

  return (
    <div ref={feedTopRef} className="scroll-mt-4 pr-1">
      <header className="mb-8">
        <h2 className={communityHeadline}>Live in this community</h2>
        <p className={`mt-2 max-w-2xl ${communityMeta}`}>
          Real-time listens, reviews, and milestones from members — updated as
          people listen and share.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-2 font-medium transition ${communityBody} ${
              filter === f.value
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/30"
                : "bg-zinc-800/90 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={`${communityBody} text-zinc-500`}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={`${communityBody} text-zinc-500`}>
          No activity for this filter yet. Member listens, reviews, follows, feed
          stories, and milestones appear here.
        </p>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.ul
            key={`feed-${filter}-${page}`}
            className="m-0 list-none space-y-7 p-0"
            initial={false}
          >
            {rows.map((row, index) => {
              const delay = reduceMotion ? 0 : Math.min(index * 0.04, 0.35);
              const motionProps = {
                initial: reduceMotion ? false : { opacity: 0, y: 14 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: reduceMotion ? 0 : 0.38,
                  delay,
                  ease: [0.25, 0.1, 0.25, 1] as const,
                },
              };

              if (row.kind === "section") {
                return (
                  <motion.li key={row.id} layout {...motionProps}>
                    <h3 className={`${communityMetaLabel} pb-1 text-emerald-500/90`}>
                      {row.title}
                    </h3>
                  </motion.li>
                );
              }

              if (row.kind === "album_listen_cluster") {
                return (
                  <motion.li key={row.id} layout {...motionProps}>
                    <AlbumListenClusterCard
                      albumId={row.albumId}
                      uniqueUserCount={row.uniqueUserCount}
                      latestAt={row.latestAt}
                      artworkUrl={row.artworkUrl}
                      sampleItems={row.items}
                    />
                  </motion.li>
                );
              }

              const { item, trending } = row;
              if (item.event_type === "listen_sessions_summary") {
                return (
                  <motion.li key={item.id} layout {...motionProps}>
                    <CommunityListenSessionsSummaryCard
                      item={item}
                      communityId={props.communityId}
                      trending={trending}
                    />
                  </motion.li>
                );
              }

              return (
                <motion.li key={item.id} layout {...motionProps}>
                  <LiveFeedItemCard
                    item={item}
                    communityId={props.communityId}
                    trending={trending}
                  />
                </motion.li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      )}

      {!loading && items.length > 0 ? (
        <div className="flex items-center justify-between gap-4 pt-10">
          <button
            type="button"
            onClick={() => void goPrev()}
            disabled={page <= 1 || navLoading}
            className={communityButton}
          >
            {navLoading ? "Loading…" : "Previous"}
          </button>
          <span className={`tabular-nums ${communityMeta}`}>Page {page}</span>
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!hasNextPage || navLoading}
            className={communityButton}
          >
            {navLoading ? "Loading…" : "Next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
