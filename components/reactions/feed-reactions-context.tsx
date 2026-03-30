"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FeedRow } from "@/components/feed/group-feed-items";
import { LIKES_ENABLED } from "@/lib/feature-likes";
import { feedRowReactionTarget } from "@/lib/reactions/feed-target";
import { reactionTargetKey } from "@/lib/reactions/keys";
import type { ReactionSnapshot } from "@/lib/reactions/types";

type FeedReactionsContextValue = {
  getSnapshot: (
    target: { targetType: string; targetId: string },
  ) => ReactionSnapshot | undefined;
  setSnapshot: (key: string, snapshot: ReactionSnapshot) => void;
  loaded: boolean;
};

const FeedReactionsContext = createContext<FeedReactionsContextValue | null>(
  null,
);

export function useFeedReactionsOptional() {
  return useContext(FeedReactionsContext);
}

export function FeedReactionsProvider({
  rows,
  children,
}: {
  rows: FeedRow[];
  children: ReactNode;
}) {
  const targets = useMemo(() => {
    const out: { targetType: string; targetId: string }[] = [];
    for (const row of rows) {
      const t = feedRowReactionTarget(row);
      if (t) out.push(t);
    }
    return out;
  }, [rows]);

  const [map, setMap] = useState<Map<string, ReactionSnapshot>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const deps = useMemo(
    () =>
      JSON.stringify(
        targets.map((t) => reactionTargetKey(t)).sort(),
      ),
    [targets],
  );

  useEffect(() => {
    if (!LIKES_ENABLED || targets.length === 0) {
      setMap(new Map());
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    fetch("/api/reactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ targets }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("batch failed"))))
      .then((data: { results?: Record<string, ReactionSnapshot> }) => {
        if (cancelled) return;
        const next = new Map<string, ReactionSnapshot>();
        const results = data.results ?? {};
        for (const k of Object.keys(results)) {
          next.set(k, results[k]);
        }
        setMap(next);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMap(new Map());
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  const getSnapshot = useCallback(
    (target: { targetType: string; targetId: string }) => {
      return map.get(reactionTargetKey(target));
    },
    [map],
  );

  const setSnapshot = useCallback((key: string, snapshot: ReactionSnapshot) => {
    setMap((prev) => {
      const n = new Map(prev);
      n.set(key, snapshot);
      return n;
    });
  }, []);

  const value = useMemo(
    () => ({ getSnapshot, setSnapshot, loaded }),
    [getSnapshot, setSnapshot, loaded],
  );

  return (
    <FeedReactionsContext.Provider value={value}>
      {children}
    </FeedReactionsContext.Provider>
  );
}
