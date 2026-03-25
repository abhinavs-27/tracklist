"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { CommunityFeedCommentThread } from "@/components/community/community-feed-comment-thread";
import { formatRelativeTime } from "@/lib/time";

type Filter = "all" | "streaks" | "listens" | "reviews" | "members";

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
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<CommunityFeedItemV2[]>(props.initialItems);
  const [loading, setLoading] = useState(false);
  const skipFirstLoad = useRef(true);
  const filterRef = useRef<Filter>("all");
  filterRef.current = filter;

  const load = useCallback(
    async (f: Filter) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/communities/${props.communityId}/feed?limit=40&filter=${encodeURIComponent(f)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { feed?: CommunityFeedItemV2[] };
        setItems(data.feed ?? []);
      } finally {
        setLoading(false);
      }
    },
    [props.communityId],
  );

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
          No activity for this filter yet. Listens, reviews, list updates, and milestones
          appear here for members.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const isReview = item.event_type === "review";
            const rating = Number(item.payload?.rating) || 0;
            const showEntityLink =
              isReview && item.entity_href && item.entity_name;

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
                {item.review_id ? (
                  <CommunityFeedCommentThread
                    communityId={props.communityId}
                    targetType="review"
                    targetId={item.review_id}
                    initialCount={item.comment_count}
                  />
                ) : item.log_id ? (
                  <CommunityFeedCommentThread
                    communityId={props.communityId}
                    targetType="log"
                    targetId={item.log_id}
                    initialCount={item.comment_count}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
