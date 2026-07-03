import { useCallback, useEffect, useRef, useState } from "react";
import { fetcher } from "../api";
import type { ReactionTarget } from "../feed-reaction-target";

const LIKE_EMOJI = "❤️";

type Snapshot = { counts: Record<string, number>; mine: string | null };

function likeCount(snap: Snapshot): number {
  return snap.counts[LIKE_EMOJI] ?? 0;
}

export function useItemReaction(target: ReactionTarget | null) {
  const [snap, setSnap] = useState<Snapshot>({ counts: {}, mine: null });
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch initial reaction state once
  useEffect(() => {
    if (!target || fetchedRef.current) return;
    fetchedRef.current = true;

    fetcher<{ results?: Record<string, Snapshot> }>("/api/reactions/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: [target] }),
    })
      .then((data) => {
        // Server keys the results map with a unit-separator (\u001f), matching
        // the shared reactionTargetKey() the web uses — not a colon.
        const key = `${target.targetType}\u001f${target.targetId}`;
        const s = data.results?.[key];
        if (s) setSnap(s);
      })
      .catch(() => {/* silent — reactions are non-critical */});
  }, [target]);

  const toggle = useCallback(async () => {
    if (!target || loading) return;
    const isLiked = snap.mine === LIKE_EMOJI;
    // Optimistic update
    setSnap((prev) => ({
      counts: {
        ...prev.counts,
        [LIKE_EMOJI]: Math.max(0, (prev.counts[LIKE_EMOJI] ?? 0) + (isLiked ? -1 : 1)),
      },
      mine: isLiked ? null : LIKE_EMOJI,
    }));
    setLoading(true);
    try {
      if (isLiked) {
        await fetcher("/api/reactions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType: target.targetType, targetId: target.targetId }),
        });
      } else {
        await fetcher("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType: target.targetType,
            targetId: target.targetId,
            emoji: LIKE_EMOJI,
          }),
        });
      }
    } catch {
      // Revert on error
      setSnap((prev) => ({
        counts: {
          ...prev.counts,
          [LIKE_EMOJI]: Math.max(0, (prev.counts[LIKE_EMOJI] ?? 0) + (isLiked ? 1 : -1)),
        },
        mine: isLiked ? LIKE_EMOJI : null,
      }));
    } finally {
      setLoading(false);
    }
  }, [target, snap, loading]);

  return {
    liked: snap.mine === LIKE_EMOJI,
    count: likeCount(snap),
    toggle,
    loading,
  };
}
