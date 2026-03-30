"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SendRecommendationModal } from "@/components/taste-match/send-recommendation-modal";
import type { SendBackPrefill } from "@/lib/social/send-back-prefill";

type Props = {
  recipientUserId: string;
  prefill: SendBackPrefill;
  /** Larger CTA on thread detail; compact in list rows. */
  variant?: "prominent" | "compact";
};

export function InboxSendBackButton({
  recipientUserId,
  prefill,
  variant = "compact",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const btn =
    variant === "prominent"
      ? "inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600/90 to-emerald-500/85 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/30 transition hover:from-emerald-500 hover:to-emerald-400/90 hover:ring-emerald-300/40"
      : "inline-flex min-h-9 items-center justify-center rounded-xl bg-emerald-500/20 px-3.5 text-[13px] font-semibold text-emerald-100 ring-1 ring-emerald-500/40 transition hover:bg-emerald-500/30 hover:ring-emerald-400/50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`pointer-events-auto ${btn}`}
      >
        Send back
      </button>
      {open ? (
        <SendRecommendationModal
          recipientUserId={recipientUserId}
          onClose={() => setOpen(false)}
          onSent={() => router.refresh()}
          initialKind={prefill.initialKind}
          initialQuery={prefill.initialQuery}
          contextHint={prefill.contextHint}
        />
      ) : null}
    </>
  );
}
