"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LikeReactionBar } from "@/components/reactions/like-reaction-bar";
import { SendRecommendationModal } from "@/components/taste-match/send-recommendation-modal";
import { LIKES_ENABLED } from "@/lib/feature-likes";
import { SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED } from "@/lib/feature-social-music-rec-ui";
import type { ReactionSnapshot } from "@/lib/reactions/types";

type Props = {
  notificationId: string;
  actorUserId: string | null;
  actorUsername: string;
  /** From server: reaction, return recommendation, or no actor. */
  initialResponded: boolean;
};

export function MusicRecommendationNotificationFooter({
  notificationId,
  actorUserId,
  actorUsername,
  initialResponded,
}: Props) {
  if (!SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED) return null;

  const router = useRouter();
  const [recOpen, setRecOpen] = useState(false);
  const [snap, setSnap] = useState<ReactionSnapshot | null>(null);

  const onSnapshotChange = useCallback((s: ReactionSnapshot) => {
    setSnap(s);
  }, []);

  const responded = useMemo(
    () => initialResponded || Boolean(snap?.mine),
    [initialResponded, snap?.mine],
  );

  const target = useMemo(
    () => ({
      targetType: "notification_recommendation" as const,
      targetId: notificationId,
    }),
    [notificationId],
  );

  return (
    <>
      {LIKES_ENABLED ? (
        <LikeReactionBar
          standalone
          target={target}
          onSnapshotChange={onSnapshotChange}
        />
      ) : null}
      {!responded && actorUserId ? (
        <div
          className={`space-y-2 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2.5 ${
            LIKES_ENABLED ? "mt-2" : ""
          }`}
        >
          <p className="text-[13px] leading-snug text-amber-100/95">
            <span className="font-medium text-amber-50">{actorUsername}</span>
            {LIKES_ENABLED
              ? " sent you a recommendation — send one back or like above."
              : " sent you a recommendation — send one back below."}
          </p>
          <p className="text-[11px] text-amber-200/75">You haven't responded yet.</p>
          <button
            type="button"
            onClick={() => setRecOpen(true)}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            Send a recommendation
          </button>
        </div>
      ) : null}
      {recOpen && actorUserId ? (
        <SendRecommendationModal
          recipientUserId={actorUserId}
          onClose={() => setRecOpen(false)}
          onSent={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
