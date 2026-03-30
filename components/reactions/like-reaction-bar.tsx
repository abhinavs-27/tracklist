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
  for (const c of Object.values(snapshot.counts)) {
    n += c;
  }
  return n;
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {filled ? (
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
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
}: {
  target: { targetType: string; targetId: string };
  standalone?: boolean;
  onSnapshotChange?: (snapshot: ReactionSnapshot) => void;
  noTopBorder?: boolean;
}) {
  const { data: session, status } = useSession();
  const feedCtx = useFeedReactionsOptional();
  const useFeed = !standalone && feedCtx;
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;

  const fromFeed =
    useFeed && feedCtx!.loaded
      ? (feedCtx!.getSnapshot(target) ?? empty)
      : undefined;

  const [standaloneSnap, setStandaloneSnap] = useState<ReactionSnapshot | null>(
    null,
  );

  useEffect(() => {
    if (!standalone) return;
    let cancelled = false;
    fetch("/api/reactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ targets: [target] }),
    })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("batch failed")),
      )
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
    return () => {
      cancelled = true;
    };
  }, [target.targetType, target.targetId, standalone]);

  const snapshot: ReactionSnapshot = fromFeed ?? standaloneSnap ?? empty;

  const total = useMemo(() => totalLikeCount(snapshot), [snapshot]);
  const likedByMe = snapshot.mine != null;

  const toggle = useCallback(async () => {
    if (status !== "authenticated" || !session?.user) return;
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
  }, [status, session?.user, target, standalone, feedCtx]);

  const canLike = status === "authenticated";

  return (
    <div
      className={`${noTopBorder ? "" : "border-t border-zinc-800/80"} ${
        likedByMe || total > 0
          ? "bg-rose-950/10 ring-1 ring-rose-500/15"
          : "bg-zinc-950/40 ring-1 ring-white/[0.04]"
      } rounded-xl`}
      role="group"
      aria-label={
        total > 0
          ? `Likes, ${total} total${likedByMe ? ", including yours" : ""}`
          : "Like"
      }
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          disabled={!canLike}
          title={
            canLike
              ? likedByMe
                ? "Unlike"
                : "Like"
              : "Sign in to like"
          }
          onClick={() => void toggle()}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
            likedByMe
              ? "border-rose-500/60 bg-rose-500/15 text-rose-300 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]"
              : "border-zinc-700/90 bg-zinc-900/50 text-zinc-300 hover:border-rose-500/40 hover:bg-rose-950/20 hover:text-rose-200/90"
          } disabled:cursor-not-allowed disabled:opacity-40`}
          aria-pressed={likedByMe}
        >
          <HeartIcon filled={likedByMe} className="h-5 w-5 shrink-0" />
          <span>{likedByMe ? "Liked" : "Like"}</span>
        </button>
        {total > 0 ? (
          <span
            className="min-w-[1.5rem] text-sm font-semibold tabular-nums text-zinc-300"
            title="Total likes"
          >
            {total}
          </span>
        ) : canLike ? (
          <span className="text-xs text-zinc-600">Be the first</span>
        ) : (
          <span className="text-xs text-zinc-600">Sign in to like</span>
        )}
      </div>
    </div>
  );
}
