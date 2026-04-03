"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { WeeklyBillboardView } from "@/components/charts/weekly-billboard";
import { CommunityBillboardBodySkeleton } from "@/components/community/community-section-skeleton";
import type { LatestWeeklyChartApiResult } from "@/lib/charts/get-user-weekly-chart";
import { formatWeeklyChartWeekLabel } from "@/lib/charts/week-label";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { cardMuted } from "@/lib/ui/surface";

const TABS: { value: ChartType; label: string }[] = [
  { value: "tracks", label: "Tracks" },
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
];

const ALL_CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

function chartCacheKey(type: ChartType, week: string | null): string {
  return `${type}:${week ?? "__latest__"}`;
}

type WeekOption = { week_start: string; week_end: string };

export function CommunityWeeklyBillboardClient(props: {
  communityId: string;
  initialType: ChartType;
  /** When set with `initialChartData`, avoids duplicate GET charts/weeks + charts on load. */
  initialWeeks?: WeekOption[];
  /** Latest chart for `initialType` (or null if none); omit both to fetch client-side only. */
  initialChartData?: LatestWeeklyChartApiResult | null;
}) {
  const serverPrimedChart = props.initialChartData !== undefined;

  const [chartType, setChartType] = useState<ChartType>(props.initialType);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weeksByType, setWeeksByType] = useState<
    Partial<Record<ChartType, WeekOption[]>>
  >(() =>
    props.initialWeeks && props.initialType
      ? { [props.initialType]: props.initialWeeks }
      : {},
  );
  const weeksByTypeRef = useRef<Partial<Record<ChartType, WeekOption[]>>>(
    props.initialWeeks && props.initialType
      ? { [props.initialType]: props.initialWeeks }
      : {},
  );
  const weeksInflightRef = useRef<Set<ChartType>>(new Set());

  const [data, setData] = useState<LatestWeeklyChartApiResult | null>(() =>
    props.initialChartData !== undefined ? props.initialChartData : null,
  );
  const [loading, setLoading] = useState(() => !serverPrimedChart);
  const [error, setError] = useState<string | null>(() =>
    props.initialChartData === undefined
      ? null
      : props.initialChartData === null
        ? "No chart yet — community charts are built each Sunday for the prior week."
        : null,
  );
  const skipChartFetchOnce = useRef(props.initialChartData !== undefined);

  const chartCacheRef = useRef(
    new Map<string, LatestWeeklyChartApiResult>(),
  );

  useLayoutEffect(() => {
    if (props.initialChartData != null) {
      chartCacheRef.current.set(
        chartCacheKey(props.initialType, null),
        props.initialChartData,
      );
    }
  }, [props.initialChartData, props.initialType]);

  const base = `/api/communities/${encodeURIComponent(props.communityId)}`;

  useEffect(() => {
    weeksByTypeRef.current = weeksByType;
  }, [weeksByType]);

  const loadWeeks = useCallback(
    async (type: ChartType) => {
      if (weeksByTypeRef.current[type] !== undefined) return;
      if (weeksInflightRef.current.has(type)) return;
      weeksInflightRef.current.add(type);
      try {
        const res = await fetch(
          `${base}/charts/weeks?type=${encodeURIComponent(type)}`,
          { cache: "no-store", credentials: "include" },
        );
        const json = (await res.json().catch(() => null)) as
          | { weeks?: WeekOption[]; error?: string }
          | null;
        const list = res.ok ? (json?.weeks ?? []) : [];
        weeksByTypeRef.current[type] = list;
        setWeeksByType((prev) => ({ ...prev, [type]: list }));
      } catch {
        weeksByTypeRef.current[type] = [];
        setWeeksByType((prev) => ({ ...prev, [type]: [] }));
      } finally {
        weeksInflightRef.current.delete(type);
      }
    },
    [base],
  );

  /** Load week lists for all tabs in parallel so switching tabs doesn’t wait on the network. */
  useEffect(() => {
    void Promise.all(ALL_CHART_TYPES.map((t) => loadWeeks(t)));
  }, [loadWeeks]);

  const prefetchChart = useCallback(
    async (type: ChartType, week: string | null) => {
      const key = chartCacheKey(type, week);
      if (chartCacheRef.current.has(key)) return;
      try {
        const q = new URLSearchParams({ type });
        if (week) q.set("weekStart", week);
        const res = await fetch(`${base}/charts?${q.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as LatestWeeklyChartApiResult;
        chartCacheRef.current.set(key, json);
      } catch {
        /* ignore prefetch failures */
      }
    },
    [base],
  );

  const loadChart = useCallback(
    async (type: ChartType, week: string | null) => {
      const key = chartCacheKey(type, week);
      const cached = chartCacheRef.current.get(key);
      if (cached !== undefined) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ type });
        if (week) q.set("weekStart", week);
        const res = await fetch(`${base}/charts?${q.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as
          | LatestWeeklyChartApiResult
          | { error?: string };
        if (!res.ok) {
          setData(null);
          setError(
            (json as { error?: string })?.error ?? "Could not load chart",
          );
          return;
        }
        const payload = json as LatestWeeklyChartApiResult;
        chartCacheRef.current.set(key, payload);
        setData(payload);
      } catch {
        setData(null);
        setError("Could not load chart");
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    if (skipChartFetchOnce.current) {
      skipChartFetchOnce.current = false;
      if (
        props.initialChartData !== undefined &&
        chartType === props.initialType &&
        weekStart === null
      ) {
        return;
      }
    }
    void loadChart(chartType, weekStart);
  }, [chartType, weekStart, loadChart, props.initialChartData, props.initialType]);

  /** After the visible chart loads, warm cache for the other tabs (same week). */
  useEffect(() => {
    if (loading || !data) return;
    for (const t of ALL_CHART_TYPES) {
      if (t === chartType) continue;
      void prefetchChart(t, weekStart);
    }
  }, [chartType, data, loading, prefetchChart, weekStart]);

  const weeks = weeksByType[chartType] ?? [];
  const weeksReady = weeksByType[chartType] !== undefined;

  useEffect(() => {
    if (!weekStart || weeks.length === 0) return;
    const ok = weeks.some((w) => w.week_start === weekStart);
    if (!ok) setWeekStart(null);
  }, [weekStart, weeks]);

  const firstWeek = weeks[0]?.week_start;
  const selectedIndex =
    weekStart == null ? 0 : weeks.findIndex((w) => w.week_start === weekStart);
  const effectiveIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function applyWeek(nextWeekStart: string | null) {
    if (nextWeekStart && firstWeek && nextWeekStart === firstWeek) {
      setWeekStart(null);
      return;
    }
    setWeekStart(nextWeekStart);
  }

  function goOlder() {
    if (weeks.length === 0) return;
    const next = effectiveIndex + 1;
    if (next >= weeks.length) return;
    applyWeek(weeks[next]!.week_start);
  }

  function goNewer() {
    if (weeks.length === 0) return;
    if (effectiveIndex <= 0) return;
    const next = effectiveIndex - 1;
    if (next === 0) {
      applyWeek(null);
      return;
    }
    applyWeek(weeks[next]!.week_start);
  }

  const weekControlsDisabled = !weeksReady || weeks.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setChartType(t.value);
              setWeekStart(null);
            }}
            className={
              chartType === t.value
                ? "rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex min-w-[min(100%,18rem)] flex-col gap-1 text-sm text-zinc-400">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Week
          </span>
          <select
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white ring-1 ring-white/5 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            disabled={weekControlsDisabled}
            value={weekStart ?? firstWeek ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              applyWeek(v === firstWeek ? null : v);
            }}
          >
            {weeks.map((w, i) => (
              <option key={w.week_start} value={w.week_start}>
                {formatWeeklyChartWeekLabel(w.week_start, w.week_end)}
                {i === 0 ? " · latest" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={goOlder}
            disabled={
              weekControlsDisabled || effectiveIndex >= weeks.length - 1
            }
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Older
          </button>
          <button
            type="button"
            onClick={goNewer}
            disabled={weekControlsDisabled || effectiveIndex <= 0}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Newer →
          </button>
        </div>
      </div>

      {loading ? (
        <CommunityBillboardBodySkeleton />
      ) : error ? (
        <div className={`${cardMuted} text-sm text-zinc-400`}>
          {error}
          <p className="mt-3 text-xs text-zinc-600">
            Community charts are generated weekly (Sunday UTC) for the prior
            week, using all members’ listens combined — same rules as your
            personal billboard.
          </p>
        </div>
      ) : data ? (
        <WeeklyBillboardView
          chartKind={
            TABS.find((t) => t.value === chartType)?.label ?? chartType
          }
          chartType={chartType}
          weekLabel={data.share.weekLabel}
          weekStartIso={data.week_start}
          rankings={data.rankings}
          movers={data.movers}
          narrative={data.narrative}
          chart_moment={data.chart_moment}
          communityId={props.communityId}
          nextChartDropIso={data.next_chart_drop_iso ?? null}
          communityActiveListeners={data.community_active_users ?? null}
          viewerContributed={data.viewer_contributed === true}
        />
      ) : null}

      <p className="text-xs text-zinc-600">
        <Link
          href={`/communities/${props.communityId}`}
          className="text-emerald-500 hover:underline"
        >
          ← Community
        </Link>
      </p>
    </div>
  );
}
