"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { CommunityFeedCommentThread } from "@/components/community/community-feed-comment-thread";
import { formatRelativeTime } from "@/lib/time";

type Filter = "all" | "streaks" | "listens" | "reviews" | "members";

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
  pageSize?: number;
}) {
  const pageSize = props.pageSize ?? 20;
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<CommunityFeedItemV2[]>(props.initialItems);
  const [nextOffset, setNextOffset] = useState<number | null>(
    props.initialNextOffset ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const skipFirstLoad = useRef(true);
  const filterRef = useRef<Filter>("all");
  filterRef.current = filter;

  const load = useCallback(
    async (f: Filter) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/communities/${props.communityId}/feed?limit=${pageSize}&offset=0&filter=${encodeURIComponent(f)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          feed?: CommunityFeedItemV2[];
          next_offset?: number | null;
        };
        setItems(data.feed ?? []);
        setNextOffset(data.next_offset ?? null);
      } finally {
        setLoading(false);
      }
    },
    [props.communityId, pageSize],
  );

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/communities/${props.communityId}/feed?limit=${pageSize}&offset=${nextOffset}&filter=${encodeURIComponent(filter)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        feed?: CommunityFeedItemV2[];
        next_offset?: number | null;
      };
      const more = data.feed ?? [];
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const merged = [...prev];
        for (const row of more) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            merged.push(row);
          }
        }
        return merged;
      });
      setNextOffset(data.next_offset ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [props.communityId, pageSize, filter, nextOffset, loadingMore, loading]);

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
  }, [props.communityId]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
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
        <ul className="space-y-3">
          {items.map((item) => {
            const isReview = item.event_type === "review";
            const rating = Number(item.payload?.rating) || 0;
            const showEntityLink =
              isReview && item.entity_href && item.entity_name;
            const isFullLineLabel =
              item.event_type === "feed_story" ||
              item.event_type === "community_follow";

            return (
              <li
                key={item.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
              >
                <div className="flex gap-3">
                  <Link
                    href={`/profile/${item.user_id}`}
                    className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800"
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
                    <p className="mt-1 text-xs text-zinc-600">
                      {item.event_type.replace(/_/g, " ")} ·{" "}
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
                <CommunityFeedCommentThread
                  communityId={props.communityId}
                  {...commentThreadTarget(item)}
                  initialCount={item.comment_count}
                />
              </li>
            );
          })}
        </ul>
      )}
      {!loading && items.length > 0 && nextOffset != null ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
