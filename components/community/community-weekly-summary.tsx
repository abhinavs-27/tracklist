"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WeeklySummaryPayload } from "@/lib/community/get-community-weekly-summary";
import { queryKeys } from "@/lib/query-keys";

type Trend = { genres: { gained: string[]; lost: string[] } } | null;

const SEGMENT_CLASS: Record<string, string> = {
  night: "bg-indigo-500/85",
  morning: "bg-amber-400/90",
  afternoon: "bg-sky-500/85",
  evening: "bg-violet-500/85",
};

export function CommunityWeeklySummary(props: { communityId: string }) {
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.communityWeeklySummary(
      props.communityId,
      timeZone ?? "pending",
    ),
    queryFn: async () => {
      const tz = timeZone ?? "UTC";
      const res = await fetch(
        `/api/communities/${props.communityId}/weekly-summary?timeZone=${encodeURIComponent(tz)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json() as Promise<{
        current: WeeklySummaryPayload | null;
        previous: WeeklySummaryPayload | null;
        trend: Trend;
      }>;
    },
    enabled: !!timeZone,
  });

  if (!timeZone || isPending) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="h-24 animate-pulse rounded-lg bg-zinc-800/50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-sm text-zinc-500">Couldn&apos;t load this week&apos;s vibe.</p>
      </section>
    );
  }

  const current = data?.current;
  const trend = data?.trend ?? null;

  if (!current) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-sm font-semibold text-white">This week&apos;s vibe</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Run the weekly community job to see genres, listening styles, and activity
          patterns.
        </p>
      </section>
    );
  }

  const tzLabel = current.activity_local?.timeZone ?? timeZone;
  const localBuckets = current.activity_local?.buckets;
  const maxShare = localBuckets?.length
    ? Math.max(...localBuckets.map((b) => b.share))
    : 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-white">This week&apos;s vibe</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Week of {current.week_start} · calendar week (UTC)
      </p>

      {current.top_genres.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top genres
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {current.top_genres.slice(0, 8).map((g) => (
              <li
                key={g.name}
                className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-200"
              >
                {g.name}
                <span className="ml-1 text-zinc-500">({g.weight})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {current.top_styles.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Listening styles (members)
          </p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {current.top_styles.slice(0, 5).map((s) => (
              <li key={s.style} className="flex justify-between gap-2">
                <span className="capitalize">{s.style.replace(/-/g, " ")}</span>
                <span className="tabular-nums text-zinc-500">
                  {Math.round(s.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {localBuckets && localBuckets.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              When people listened
            </p>
            <p className="max-w-[65%] text-right text-[10px] leading-tight text-zinc-600">
              Your timezone · {tzLabel.replace(/_/g, " ")}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            Share of this community&apos;s listens in the last 7 days, by local time of day.
          </p>

          {maxShare <= 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              No listens in this community for that window yet — check back after people log
              music.
            </p>
          ) : null}

          <div
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700/80"
            role="img"
            aria-label="Listening activity by time of day"
          >
            {maxShare > 0
              ? localBuckets.map((b) => {
                  const pct = Math.max(0, Math.round(b.share * 1000) / 10);
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={b.id}
                      className={`h-full min-w-[2px] ${SEGMENT_CLASS[b.id] ?? "bg-emerald-600/80"}`}
                      style={{ width: `${pct}%` }}
                      title={`${b.label} (${b.rangeHint}): ${pct}%`}
                    />
                  );
                })
              : null}
          </div>

          {maxShare > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {localBuckets.map((b) => {
              const pct = Math.round(b.share * 100);
              return (
                <li key={b.id} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${SEGMENT_CLASS[b.id] ?? "bg-zinc-500"}`}
                    />
                    <span className="truncate text-sm font-medium text-zinc-200">
                      {b.label}
                    </span>
                  </div>
                  <p className="pl-4 text-[11px] text-zinc-500">{b.rangeHint}</p>
                  <p className="pl-4 text-lg font-semibold tabular-nums text-zinc-100">
                    {pct}%
                  </p>
                </li>
              );
            })}
          </ul>
          ) : null}
        </div>
      ) : Object.keys(current.activity_pattern).length > 0 ? (
        <div className="mt-4">
          <p className="text-xs text-zinc-500">
            Activity chart unavailable — add a valid timezone or run the weekly job.
          </p>
        </div>
      ) : null}

      {trend && (trend.genres.gained.length > 0 || trend.genres.lost.length > 0) ? (
        <div className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span className="text-zinc-500">vs last week: </span>
          {trend.genres.gained.length > 0 ? (
            <span className="text-emerald-400">
              + {trend.genres.gained.join(", ")}
            </span>
          ) : null}
          {trend.genres.gained.length > 0 && trend.genres.lost.length > 0
            ? " · "
            : null}
          {trend.genres.lost.length > 0 ? (
            <span className="text-rose-400/90">
              − {trend.genres.lost.join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
