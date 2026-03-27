"use client";

import { useSession } from "next-auth/react";
import { FloatingLogButton } from "./floating-log-button";
import { QuickLogModal } from "./quick-log-modal";
import { useLogging } from "./logging-context";

export function LoggingShell() {
  const { data: session, status } = useSession();
  const { quickLogOpen, setQuickLogOpen } = useLogging();

  if (status === "loading" || !session?.user?.id) return null;

  return (
    <>
      <FloatingLogButton />
      <QuickLogModal open={quickLogOpen} onClose={() => setQuickLogOpen(false)} />
    </>
  );
}
