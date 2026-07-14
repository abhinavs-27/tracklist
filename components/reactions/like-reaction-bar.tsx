"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LIKE_REACTION_EMOJI } from "@/lib/reactions/constants";
import { reactionTargetKey } from "@/lib/reactions/keys";
import type { ReactionSnapshot } from "@/lib/reactions/types";
import { useFeedReactionsOptional } from "@/components/reactions/feed-reactions-context";

const empty: ReactionSnapshot = { counts: {}, mine: null };

function totalLikeCount(snapshot: ReactionSnapshot): number {
  let n = 0;
  for (const c of Object.values(snapshot.counts)) n += c;
  return n;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      {filled ? (
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      )}
    </svg>
  );
}

export function LikeReactionBar({
  target,
  standalone = false,
  onSnapshotChange,
  noTopBorder = false,
  compact = false,
}: {
  target: { targetType: string; targetId: string };
  standalone?: boolean;
  onSnapshotChange?: (snapshot: ReactionSnapshot) => void;
  noTopBorder?: boolean;
  /** Strip internal padding — use when parent owns the spacing. */
  compact?: boolean;
}) {
  const { data: session, status } = useSession();
  const feedCtx = useFeedReactionsOptional();
  const useFeed = !standalone && feedCtx;
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  });

  const fromFeed =
    useFeed && feedCtx!.loaded
      ? (feedCtx!.getSnapshot(target) ?? empty)
      : undefined;

  const [standaloneSnap, setStandaloneSnap] = useState<ReactionSnapshot | null>(null);
  const [popped, setPopped] = useState(false);

  useEffect(() => {
    if (!standalone) return;
    let cancelled = false;
    fetch("/api/reactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ targets: [target] }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("batch failed"))))
      .then((data: { results?: Record<string, ReactionSnapshot> }) => {
        if (cancelled) return;
        const k = reactionTargetKey(target);
        const snap = data.results?.[k] ?? empty;
        setStandaloneSnap(snap);
        onSnapshotChangeRef.current?.(snap);
      })
      .catch(() => {
        if (cancelled) return;
        setStandaloneSnap(empty);
      });
    return () => { cancelled = true; };
  }, [target.targetType, target.targetId, standalone]);

  const snapshot: ReactionSnapshot = fromFeed ?? standaloneSnap ?? empty;
  const total = useMemo(() => totalLikeCount(snapshot), [snapshot]);
  const likedByMe = snapshot.mine != null;
  const canLike = status === "authenticated";

  const toggle = useCallback(async () => {
    if (!canLike || !session?.user) return;
    if (!likedByMe) {
      setPopped(true);
      setTimeout(() => setPopped(false), 200);
    }
    const key = reactionTargetKey(target);
    const res = await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        targetType: target.targetType,
        targetId: target.targetId,
        emoji: LIKE_REACTION_EMOJI,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      key?: string;
      snapshot?: ReactionSnapshot;
      error?: string;
    };
    if (!res.ok || !data.snapshot) return;
    onSnapshotChangeRef.current?.(data.snapshot);
    if (standalone) {
      setStandaloneSnap(data.snapshot);
    } else if (feedCtx) {
      feedCtx.setSnapshot(data.key ?? key, data.snapshot);
    }
  }, [canLike, session?.user, target, standalone, feedCtx, likedByMe]);

  return (
    <div className={noTopBorder ? "" : "border-t border-zinc-800/60"}>
      <div className={compact ? "flex items-center gap-4" : "flex items-center gap-4 px-4 py-2.5 sm:px-5"}>
        <button
          type="button"
          disabled={!canLike}
          title={canLike ? (likedByMe ? "Unlike" : "Like") : "Sign in to like"}
          onClick={() => void toggle()}
          aria-pressed={likedByMe}
          className={`flex items-center gap-1.5 transition-all duration-150 disabled:opacity-40 ${
            likedByMe ? "text-rose-500" : "text-zinc-500 hover:text-rose-400"
          } ${popped ? "scale-125" : "scale-100"}`}
        >
          <HeartIcon filled={likedByMe} />
          {total > 0 && (
            <span className="min-w-[1ch] text-xs tabular-nums">{total}</span>
          )}
        </button>
      </div>
    </div>
  );
}
