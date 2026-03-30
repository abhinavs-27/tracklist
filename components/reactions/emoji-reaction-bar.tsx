"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { REACTION_EMOJIS } from "@/lib/reactions/constants";
import { reactionTargetKey } from "@/lib/reactions/keys";
import type { ReactionSnapshot } from "@/lib/reactions/types";
import { useFeedReactionsOptional } from "@/components/reactions/feed-reactions-context";

const empty: ReactionSnapshot = { counts: {}, mine: null };

export function EmojiReactionBar({
  target,
  standalone = false,
  onSnapshotChange,
  noTopBorder = false,
}: {
  target: { targetType: string; targetId: string };
  /** When true, fetch this target outside feed context (e.g. notifications). */
  standalone?: boolean;
  /** Fires when the snapshot updates (initial fetch or after toggle). */
  onSnapshotChange?: (snapshot: ReactionSnapshot) => void;
  /** When nested under another bordered footer (e.g. feed engagement strip). */
  noTopBorder?: boolean;
}) {
  const { data: session, status } = useSession();
  const feedCtx = useFeedReactionsOptional();
  const useFeed = !standalone && feedCtx;
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;

  const fromFeed =
    useFeed && feedCtx!.loaded
      ? feedCtx!.getSnapshot(target) ?? empty
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
    return () => {
      cancelled = true;
    };
  }, [target.targetType, target.targetId, standalone]);

  const snapshot: ReactionSnapshot =
    fromFeed ?? standaloneSnap ?? empty;

  const toggle = useCallback(
    async (emoji: string) => {
      if (status !== "authenticated" || !session?.user) return;
      const key = reactionTargetKey(target);
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetType: target.targetType,
          targetId: target.targetId,
          emoji,
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
    },
    [status, session?.user, target, standalone, feedCtx],
  );

  const canReact = status === "authenticated";

  return (
    <div
      className={`flex flex-wrap items-center gap-1 px-3 py-2 ${
        noTopBorder ? "" : "border-t border-zinc-800/80"
      }`}
      role="group"
      aria-label="Reactions"
    >
      {REACTION_EMOJIS.map((emoji) => {
        const count = snapshot.counts[emoji] ?? 0;
        const isMine = snapshot.mine === emoji;
        return (
          <button
            key={emoji}
            type="button"
            disabled={!canReact}
            title={canReact ? undefined : "Sign in to react"}
            onClick={() => void toggle(emoji)}
            className={`inline-flex min-h-8 items-center justify-center gap-0.5 rounded-lg border px-2 text-sm transition ${
              isMine
                ? "border-emerald-600/70 bg-emerald-950/35 text-zinc-100"
                : "border-zinc-700/90 bg-zinc-900/40 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/50"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-pressed={isMine}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 ? (
              <span className="min-w-[1ch] text-[11px] font-medium tabular-nums text-zinc-400">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
