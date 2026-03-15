"use client";

import { useEffect } from "react";

/**
 * Scrolls the window to top when mounted. Used in album loading.tsx so the
 * skeleton for the top of the page (cover + tracks) is visible instead of
 * staying scrolled down from the previous page.
 */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
