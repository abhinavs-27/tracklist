"use client";

import { useEffect, useRef } from "react";

/**
 * Logs client-side hydration timing when PROFILING=1 is set at build time
 * (via NEXT_PUBLIC_PROFILING=1) so you can correlate server response with
 * time-to-interactive. Optional: send to APM (Sentry, Datadog, New Relic).
 */
export function ProfilingHydrationMarker({ page = "unknown" }: { page?: string }) {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current || typeof window === "undefined") return;
    logged.current = true;

    const enable = process.env.NEXT_PUBLIC_PROFILING === "1";
    if (!enable) return;

    const now = performance.now();
    const timing = "performance" in window && typeof (window as Window & { performance?: Performance }).performance.timing !== "undefined"
      ? (window as Window & { performance: { timing: PerformanceTiming } }).performance.timing
      : null;

    const payload = {
      perf: 1,
      category: "page",
      label: "clientHydrate",
      page,
      ms: Math.round(now * 100) / 100,
      ...(timing
        ? {
            domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
            load: timing.loadEventEnd - timing.navigationStart,
          }
        : {}),
    };

    if (process.env.NEXT_PUBLIC_PROFILING_JSON === "1") {
      console.log(JSON.stringify(payload));
    } else {
      console.log("[perf] page clientHydrate", page, "ms=" + payload.ms, timing ? `domReady=${payload.domContentLoaded} load=${payload.load}` : "");
    }
  }, [page]);

  return null;
}
