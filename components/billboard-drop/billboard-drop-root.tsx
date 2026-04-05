"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useState } from "react";
import type { BillboardDropStatus } from "@/lib/billboard-drop/billboard-drop-types";
import { BillboardDropBanner } from "@/components/billboard-drop/billboard-drop-banner";
import { BillboardDropModal } from "@/components/billboard-drop/billboard-drop-modal";

export function BillboardDropRoot({
  initial,
}: {
  initial: BillboardDropStatus;
}) {
  const [status, setStatus] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/billboard-drop", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as BillboardDropStatus;
      setStatus(json);
    } catch {
      /* ignore */
    }
  }, []);

  const onDismissed = useCallback(() => {
    setStatus((s) => ({
      ...s,
      shouldShowModal: false,
      showBanner: Boolean(s.hasChart && s.highlights),
    }));
    void refresh();
  }, [refresh]);

  const onCompleted = useCallback(() => {
    setStatus((s) => ({
      ...s,
      shouldShowModal: false,
      showBanner: false,
    }));
    void refresh();
  }, [refresh]);

  if (!status.highlights) {
    return null;
  }

  return (
    <>
      {status.showBanner ? (
        <BillboardDropBanner weekLabel={status.highlights.weekLabel} />
      ) : null}
      <AnimatePresence>
        {status.shouldShowModal ? (
          <BillboardDropModal
            key="billboard-drop"
            highlights={status.highlights}
            communityCount={status.communityCount}
            onDismissed={onDismissed}
            onCompleted={onCompleted}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
