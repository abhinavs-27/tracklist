"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Revalidates the app shell after the server marks notifications read, so the
 * header badge and You-tab dot match the database (layout runs before the page
 * in the same request, so the count can be stale until refresh).
 */
export function NotificationsAcknowledge() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    router.refresh();
  }, [router]);

  return null;
}
