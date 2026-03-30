"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/toast";
import { SendRecommendationModal } from "./send-recommendation-modal";

export function TasteMatchSocialActions({
  profileUserId,
}: {
  profileUserId: string;
}) {
  const [recOpen, setRecOpen] = useState(false);
  const { toast } = useToast();

  const btn =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-3 py-2.5 text-center text-xs font-medium text-zinc-200 shadow-sm shadow-black/20 transition-colors hover:border-emerald-500/45 hover:bg-zinc-900/90 hover:text-white sm:text-sm min-h-[44px] sm:min-h-0";

  const shareTasteMatch = useCallback(async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/profile/${profileUserId}#taste-match`;
    const title = "Taste match on Tracklist";
    const text =
      "Open this link to compare our music taste on Tracklist.";
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      /* user cancelled share sheet */
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied — paste it in a text, DM, or email.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, [profileUserId, toast]);

  return (
    <>
      <div className="mt-8 border-t border-white/5 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Connect
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Send a recommendation, or share a link to this taste match with anyone
          off-platform.
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          Tip: screenshot the comparison above if you want an image to send.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setRecOpen(true)}
            className={btn}
            title="Send them an artist, album, or track"
          >
            Send Rec
          </button>
          <button
            type="button"
            onClick={() => void shareTasteMatch()}
            className={btn}
            title="Share a link to this taste match (Messages, email, etc.)"
          >
            Share taste match
          </button>
        </div>
      </div>
      {recOpen ? (
        <SendRecommendationModal
          recipientUserId={profileUserId}
          onClose={() => setRecOpen(false)}
        />
      ) : null}
    </>
  );
}
