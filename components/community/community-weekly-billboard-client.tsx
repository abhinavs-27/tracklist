"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { WeeklyBillboardView } from "@/components/charts/weekly-billboard";
import { ChartShareModal } from "@/components/charts/chart-share-modal";
import { ChartWeekSelector } from "@/components/charts/chart-week-selector";
import { ChartTypePills } from "@/components/charts/chart-type-pills";
import { CommunityWeeklyChartSkeleton } from "@/components/community/community-section-skeleton";
import type { LatestWeeklyChartApiResult } from "@/lib/charts/get-user-weekly-chart";
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

  const [shareOpen, setShareOpen] = useState(false);
  const canShare = data
    ? data.chart_moment.top_5.length > 0 || data.chart_moment.number_one != null
    : false;

  return (
    <div className="space-y-6">
      {/* Entity pills + share — share moves here so week nav gets full width */}
      <div className="flex items-center justify-between gap-2">
        <ChartTypePills value={chartType} onChange={(t) => { setChartType(t); setWeekStart(null); }} />
        {data && (
          <button type="button" onClick={() => setShareOpen(true)} disabled={!canShare}
            className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-300 disabled:opacity-40">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186l9.566-5.314m-9.566 5.314l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z" />
            </svg>
            Share
          </button>
        )}
      </div>

      {/* Week selector — full width, identical to home page */}
      <ChartWeekSelector
        weeks={weeks}
        weekStart={weekStart}
        effectiveIndex={effectiveIndex}
        disabled={weekControlsDisabled}
        onSelect={(w) => applyWeek(w)}
        onNewer={goNewer}
        onOlder={goOlder}
      />

      {loading ? (
        <CommunityWeeklyChartSkeleton />
      ) : error ? (
        <div className={`${cardMuted} text-sm text-zinc-400`}>
          {error}
          <p className="mt-3 text-xs text-zinc-600">
            Community charts are generated weekly (Sunday UTC) for the prior week.
          </p>
        </div>
      ) : data ? (
        <WeeklyBillboardView
          chartKind={TABS.find((t) => t.value === chartType)?.label ?? chartType}
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
          hideShareSection
        />
      ) : null}

      {/* Share modal */}
      {data && (
        <ChartShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          chartKind={TABS.find((t) => t.value === chartType)?.label ?? chartType}
          chartType={chartType}
          weekStartIso={data.week_start}
          chart_moment={data.chart_moment}
          disableFormattedShare={!canShare}
          communityId={props.communityId}
          shareTitle="Share community chart"
        />
      )}
    </div>
  );
}
