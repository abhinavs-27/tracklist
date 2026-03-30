"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  EnrichedFeedActivity,
  FeedListenSessionActivity,
} from "@/components/feed/group-feed-items";
import { EmojiReactionBar } from "@/components/reactions/emoji-reaction-bar";
import { SendRecommendationModal } from "@/components/taste-match/send-recommendation-modal";
import {
  feedActivityEngagementUserId,
  feedActivityReactionTarget,
  listenGroupEngagementUserId,
  listenGroupReactionTarget,
} from "@/lib/reactions/feed-target";

const actionBtn =
  "inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-zinc-600/90 bg-zinc-900/50 px-3 py-2 text-center text-xs font-medium text-zinc-200 transition hover:border-emerald-500/45 hover:bg-zinc-800/70 sm:flex-none sm:text-sm";

type FooterProps = {
  viewerUserId: string;
  reactionTarget: { targetType: string; targetId: string } | null;
  subjectUserId: string | null;
};

function FeedEngagementFooter({
  viewerUserId,
  reactionTarget,
  subjectUserId,
}: FooterProps) {
  const [recOpen, setRecOpen] = useState(false);
  const canEngage = Boolean(
    viewerUserId &&
      subjectUserId &&
      subjectUserId !== viewerUserId,
  );
  const showReactions = Boolean(reactionTarget);
  const showActions = canEngage && subjectUserId;

  if (!showReactions && !showActions) return null;

  return (
    <div className="border-t border-zinc-800/80">
      {showReactions && reactionTarget ? (
        <EmojiReactionBar target={reactionTarget} noTopBorder />
      ) : null}
      {showActions && subjectUserId ? (
        <div
          className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center ${
            showReactions ? "border-t border-zinc-800/55" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setRecOpen(true)}
            className={actionBtn}
          >
            Send recommendation
          </button>
          <Link
            href={`/profile/${subjectUserId}#taste-match`}
            className={actionBtn}
          >
            Compare taste
          </Link>
        </div>
      ) : null}
      {recOpen && subjectUserId ? (
        <SendRecommendationModal
          recipientUserId={subjectUserId}
          onClose={() => setRecOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function FeedActivityEngagement({
  activity,
  viewerUserId,
}: {
  activity: EnrichedFeedActivity;
  viewerUserId: string;
}) {
  return (
    <FeedEngagementFooter
      viewerUserId={viewerUserId}
      reactionTarget={feedActivityReactionTarget(activity)}
      subjectUserId={feedActivityEngagementUserId(activity)}
    />
  );
}

export function FeedListenGroupEngagement({
  sessions,
  viewerUserId,
}: {
  sessions: FeedListenSessionActivity[];
  viewerUserId: string;
}) {
  return (
    <FeedEngagementFooter
      viewerUserId={viewerUserId}
      reactionTarget={listenGroupReactionTarget(sessions)}
      subjectUserId={listenGroupEngagementUserId(sessions)}
    />
  );
}
