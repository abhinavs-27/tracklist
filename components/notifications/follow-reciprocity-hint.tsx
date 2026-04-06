"use client";

import { useState } from "react";
import { FollowButton } from "@/components/follow-button";

export function FollowReciprocityHint({
  actorUserId,
  showFollowBack,
}: {
  actorUserId: string;
  /** True when the viewer does not follow this user yet. */
  showFollowBack: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (!showFollowBack || dismissed) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-zinc-700/60 bg-zinc-950/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12px] text-zinc-400">
        You haven't followed back yet — say hi in their feed.
      </p>
      <FollowButton
        userId={actorUserId}
        initialFollowing={false}
        onFollowChange={(following) => {
          if (following) setDismissed(true);
        }}
      />
    </div>
  );
}
