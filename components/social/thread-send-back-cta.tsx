"use client";

import { InboxSendBackButton } from "@/components/social/inbox-send-back-button";
import type { SendBackPrefill } from "@/lib/social/send-back-prefill";

type Props = {
  recipientUserId: string;
  prefill: SendBackPrefill;
};

/** Prominent reciprocal recommendation CTA on thread detail. */
export function ThreadSendBackCta({ recipientUserId, prefill }: Props) {
  return (
    <InboxSendBackButton
      recipientUserId={recipientUserId}
      prefill={prefill}
      variant="prominent"
    />
  );
}
