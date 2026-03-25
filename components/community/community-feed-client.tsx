"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityFeedMergedItem } from "@/lib/community/community-feed-merged";
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
  initialItems: CommunityFeedMergedItem[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<CommunityFeedMergedItem[]>(props.initialItems);
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
        const data = (await res.json()) as { feed?: CommunityFeedMergedItem[] };
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
          .channel(`community-events:${props.communityId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_events",
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
        <p className="text-sm text-zinc-500">No activity for this filter.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2"
            >
              <p className="text-sm text-zinc-200">{item.label}</p>
              <p className="text-xs text-zinc-500">
                {item.kind === "event" ? item.type : item.kind} ·{" "}
                {formatRelativeTime(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
