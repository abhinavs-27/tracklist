"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "soon";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Countdown to next Sunday 00:00 UTC (community chart ritual).
 */
export function CommunityChartDropCountdown(props: { dropIso: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const drop = new Date(props.dropIso).getTime();
  const ms = drop - now;

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95 ring-1 ring-amber-500/15">
      <p className="font-medium text-amber-50">
        Next chart drops in{" "}
        <span className="tabular-nums text-amber-200/90">
          {formatRemaining(ms)}
        </span>
      </p>
      <p className="mt-1 text-xs text-amber-200/70">
        Charts lock after each weekly run (Sunday UTC) — same ritual for every
        member.
      </p>
    </div>
  );
}
