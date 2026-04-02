"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { WeeklySummaryPayload } from "@/lib/community/get-community-weekly-summary";
import { queryKeys } from "@/lib/query-keys";
import {
  communityBody,
  communityCard,
  communityHeadline,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

type Trend = { genres: { gained: string[]; lost: string[] } } | null;

const SEGMENT_CLASS: Record<string, string> = {
  night: "bg-indigo-500/85",
  morning: "bg-amber-400/90",
  afternoon: "bg-sky-500/85",
  evening: "bg-violet-500/85",
};

export function CommunityWeeklySummary(props: {
  communityId: string;
  /** Avoid “this week” in headings (e.g. Community pulse). */
  neutralCopy?: boolean;
  /** Omit outer card — use inside a collapsible or grid cell that already has a frame. */
  bare?: boolean;
}) {
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

  const bare = props.bare === true;
  const wrapClass = bare ? "space-y-6" : communityCard;
  const Wrap: "div" | "section" = bare ? "div" : "section";

  if (!timeZone || isPending) {
    return (
      <Wrap className={wrapClass}>
        <div className="h-24 animate-pulse rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
      </Wrap>
    );
  }

  if (error) {
    return (
      <Wrap className={wrapClass}>
        <p className={`${communityBody} text-zinc-500`}>
          Couldn&apos;t load this week&apos;s vibe.
        </p>
      </Wrap>
    );
  }

  const current = data?.current;
  const trend = data?.trend ?? null;

  const neutral = props.neutralCopy === true;

  if (!current) {
    return (
      <Wrap className={wrapClass}>
        <h3 className={communityHeadline}>
          {neutral ? "Listening trends" : "This week's vibe"}
        </h3>
        <p className={`mt-2 ${communityBody} text-zinc-500`}>
          Run the weekly community job to see genres, listening styles, and activity
          patterns.
        </p>
      </Wrap>
    );
  }

  const tzLabel = current.activity_local?.timeZone ?? timeZone;
  const localBuckets = current.activity_local?.buckets;
  const maxShare = localBuckets?.length
    ? Math.max(...localBuckets.map((b) => b.share))
    : 0;
  const maxGenreWeight = Math.max(
    1,
    ...current.top_genres.map((g) => g.weight),
  );

  return (
    <Wrap className={wrapClass}>
      <h3 className={communityHeadline}>
        {neutral ? "Listening trends" : "This week's vibe"}
      </h3>
      <p className={`mt-1.5 ${communityMeta}`}>
        Week of {current.week_start} · Monday–Sunday
      </p>

      {current.top_genres.length > 0 ? (
        <div className="mt-5">
          <p className={communityMetaLabel}>Top genres</p>
          <p className={`mt-1 ${communityMeta} text-zinc-600`}>
            Weighted by group listening (same chart as the mobile Vibe tab)
          </p>
          <ul className="mt-3 space-y-2.5">
            {current.top_genres.slice(0, 10).map((g) => (
              <li key={g.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate font-medium text-zinc-200 ${communityBody}`}>
                    {g.name}
                  </span>
                  <span className={`shrink-0 tabular-nums ${communityMeta}`}>
                    {g.weight}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (g.weight / maxGenreWeight) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {current.top_styles.length > 0 ? (
        <div className="mt-5">
          <p className={communityMetaLabel}>Listening styles</p>
          <p className={`mt-1 ${communityMeta} text-zinc-600`}>
            {neutral ? "Share of group taste" : "Share of group taste this week"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {current.top_styles.slice(0, 12).map((s) => (
              <span
                key={s.style}
                className="rounded-full border border-white/[0.08] bg-zinc-900/80 px-3 py-1.5 text-sm font-semibold text-zinc-200"
              >
                {s.style.replace(/-/g, " ")} · {Math.round(s.share * 100)}%
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {localBuckets && localBuckets.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-end justify-between gap-2">
            <p className={communityMetaLabel}>When people listened</p>
            <p className={`max-w-[65%] text-right leading-tight text-zinc-600 ${communityMeta}`}>
              Your timezone · {tzLabel.replace(/_/g, " ")}
            </p>
          </div>
          <p className={`mt-2 ${communityMeta} text-zinc-600`}>
            Share of this community&apos;s listens in the last 7 days, by local time of day.
          </p>

          {maxShare <= 0 ? (
            <p className={`mt-4 ${communityBody} text-zinc-500`}>
              No listens in this community for that week yet — check back after people log
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
                    <span className={`truncate font-medium text-zinc-200 ${communityBody}`}>
                      {b.label}
                    </span>
                  </div>
                  <p className={`pl-4 ${communityMeta} text-zinc-500`}>{b.rangeHint}</p>
                  <p className={`pl-4 ${communityHeadline} font-semibold tabular-nums text-zinc-100`}>
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
          <p className={`${communityBody} text-zinc-500`}>
            Activity chart unavailable — add a valid timezone or run the weekly job.
          </p>
        </div>
      ) : null}

      {trend && (trend.genres.gained.length > 0 || trend.genres.lost.length > 0) ? (
        <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-4 ring-1 ring-emerald-500/10">
          <p className={communityMetaLabel}>
            {neutral ? "Genre momentum" : "This week's genre leaders"}
          </p>
          <p className={`mt-1 ${communityMeta} text-zinc-500`}>
            Momentum vs last week — genres surging or cooling in the group
          </p>
          {trend.genres.gained.length > 0 ? (
            <div className="mt-3">
              <p className={`mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-500/90 ${communityMeta}`}>
                Gaining
              </p>
              <div className="flex flex-wrap gap-2">
                {trend.genres.gained.slice(0, 12).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-emerald-500/35 bg-emerald-950/50 px-3 py-1.5 text-sm font-medium text-emerald-200"
                  >
                    ↑ {g}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {trend.genres.lost.length > 0 ? (
            <div className={trend.genres.gained.length > 0 ? "mt-4" : "mt-3"}>
              <p className={`mb-2 text-xs font-semibold uppercase tracking-wide text-rose-400/90 ${communityMeta}`}>
                Cooling
              </p>
              <div className="flex flex-wrap gap-2">
                {trend.genres.lost.slice(0, 12).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-sm font-medium text-rose-200/95"
                  >
                    ↓ {g}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Wrap>
  );
}
