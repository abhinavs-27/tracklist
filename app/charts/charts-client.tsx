"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { WeeklyBillboardView } from "@/components/charts/weekly-billboard";
import { ChartWeekSelector } from "@/components/charts/chart-week-selector";
import { ChartTypePills } from "@/components/charts/chart-type-pills";
import type { LatestWeeklyChartApiResult } from "@/lib/charts/get-user-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import {
  readStaleSessionCache,
  writeStaleSessionCache,
} from "@/lib/client/stale-session-cache";
import { cardMuted } from "@/lib/ui/surface";

const WEEKS_FETCH_LIMIT = 104;

function billboardWeeksCacheKey(type: ChartType) {
  return `billboard-weeks:${type}:${WEEKS_FETCH_LIMIT}`;
}

function billboardChartCacheKey(type: ChartType, week: string | null) {
  return `billboard-chart:${type}:${week ?? "latest"}`;
}

function stripFetchedAt(
  row: LatestWeeklyChartApiResult & { fetched_at?: string },
): LatestWeeklyChartApiResult {
  const { fetched_at, ...rest } = row;
  void fetched_at;
  return rest;
}

const TABS: { value: ChartType; label: string }[] = [
  { value: "tracks", label: "Tracks" },
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
];

type WeekOption = { week_start: string; week_end: string };

export function ChartsClient(props: {
  initialType: ChartType;
  initialWeekStart: string | null;
  /** When embedded in another page (e.g. home), hide the standalone back-link. */
  hideBackLink?: boolean;
}) {
  const [chartType, setChartType] = useState<ChartType>(props.initialType);
  const [weekStart, setWeekStart] = useState<string | null>(
    props.initialWeekStart,
  );
  const [weeks, setWeeks] = useState<WeekOption[]>(() => {
    const c = readStaleSessionCache<{
      weeks: WeekOption[];
      fetched_at?: string;
    }>(billboardWeeksCacheKey(props.initialType));
    return c?.weeks ?? [];
  });
  const [data, setData] = useState<LatestWeeklyChartApiResult | null>(() => {
    const c = readStaleSessionCache<
      LatestWeeklyChartApiResult & { fetched_at?: string }
    >(billboardChartCacheKey(props.initialType, props.initialWeekStart));
    if (!c?.fetched_at) return null;
    return stripFetchedAt(c);
  });
  const [loading, setLoading] = useState(() => {
    const c = readStaleSessionCache<
      LatestWeeklyChartApiResult & { fetched_at?: string }
    >(billboardChartCacheKey(props.initialType, props.initialWeekStart));
    return c?.fetched_at == null;
  });
  const [loadingWeeks, setLoadingWeeks] = useState(() => {
    const c = readStaleSessionCache<
      { weeks: WeekOption[]; fetched_at?: string } | undefined
    >(billboardWeeksCacheKey(props.initialType));
    return c?.fetched_at == null;
  });
  const [error, setError] = useState<string | null>(null);
  const billboardAckSent = useRef(false);

  const syncUrl = useCallback((type: ChartType, week: string | null) => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("type", type);
    if (week) u.searchParams.set("weekStart", week);
    else u.searchParams.delete("weekStart");
    window.history.replaceState({}, "", u.toString());
  }, []);

  const loadWeeks = useCallback(async (type: ChartType) => {
    const cacheKey = billboardWeeksCacheKey(type);
    const cached = readStaleSessionCache<{
      weeks: WeekOption[];
      fetched_at?: string;
    }>(cacheKey);
    if (cached?.fetched_at) {
      setWeeks(cached.weeks ?? []);
      setLoadingWeeks(false);
    } else {
      setLoadingWeeks(true);
    }
    try {
      const res = await fetch(
        `/api/charts/weeks?type=${encodeURIComponent(type)}&limit=${WEEKS_FETCH_LIMIT}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { weeks?: WeekOption[]; error?: string; fetched_at?: string }
        | null;
      if (!res.ok) {
        setWeeks([]);
        return;
      }
      if (json && res.ok) {
        writeStaleSessionCache(cacheKey, json);
      }
      setWeeks(json?.weeks ?? []);
    } catch {
      setWeeks([]);
    } finally {
      setLoadingWeeks(false);
    }
  }, []);

  const loadChart = useCallback(
    async (type: ChartType, week: string | null) => {
      const cacheKey = billboardChartCacheKey(type, week);
      const cached = readStaleSessionCache<
        LatestWeeklyChartApiResult & { fetched_at?: string }
      >(cacheKey);
      if (cached?.fetched_at) {
        setData(stripFetchedAt(cached));
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const q = new URLSearchParams({ type });
        if (week) q.set("weekStart", week);
        const res = await fetch(`/api/charts?${q.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | (LatestWeeklyChartApiResult & { fetched_at?: string })
          | { error?: string };
        if (!res.ok) {
          setData(null);
          setError(
            (json as { error?: string })?.error ?? "Could not load chart",
          );
          return;
        }
        const row = json as LatestWeeklyChartApiResult & {
          fetched_at?: string;
        };
        writeStaleSessionCache(cacheKey, row);
        setData(stripFetchedAt(row));
      } catch {
        if (!cached?.fetched_at) {
          setData(null);
        }
        setError("Could not load chart");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadWeeks(chartType);
  }, [chartType, loadWeeks]);

  useEffect(() => {
    void loadChart(chartType, weekStart);
  }, [chartType, weekStart, loadChart]);

  /** Acknowledge Weekly Billboard drop when viewing the latest sealed week (hides home modal/banner). */
  useEffect(() => {
    if (billboardAckSent.current || !data || loading || weeks.length === 0) return;
    const first = weeks[0]?.week_start;
    if (!first || data.week_start !== first) return;
    const viewingLatest = weekStart == null || weekStart === first;
    if (!viewingLatest) return;
    billboardAckSent.current = true;
    void fetch("/api/me/billboard-drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ack_chart_view",
        week_start: data.week_start,
      }),
    });
  }, [data, loading, weekStart, weeks]);

  /** After weeks load, drop invalid week selection. */
  useEffect(() => {
    if (loadingWeeks || !weekStart || weeks.length === 0) return;
    const ok = weeks.some((w) => w.week_start === weekStart);
    if (!ok) setWeekStart(null);
  }, [loadingWeeks, weekStart, weeks]);

  const firstWeek = weeks[0]?.week_start;
  const selectedIndex =
    weekStart == null
      ? 0
      : weeks.findIndex((w) => w.week_start === weekStart);
  const effectiveIndex =
    selectedIndex >= 0 ? selectedIndex : 0;

  /** First week in list = “latest” chart; URL omits weekStart when null. */
  function applyWeek(nextWeekStart: string | null) {
    if (nextWeekStart && firstWeek && nextWeekStart === firstWeek) {
      setWeekStart(null);
      syncUrl(chartType, null);
      return;
    }
    setWeekStart(nextWeekStart);
    syncUrl(chartType, nextWeekStart);
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

  return (
    <div className="space-y-10">
      <ChartTypePills value={chartType} onChange={(t) => { setChartType(t); setWeekStart(null); syncUrl(t, null); }} />

      <ChartWeekSelector
        weeks={weeks}
        weekStart={weekStart}
        effectiveIndex={effectiveIndex}
        disabled={loadingWeeks}
        onSelect={(w) => applyWeek(w)}
        onNewer={goNewer}
        onOlder={goOlder}
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading chart…</p>
      ) : error ? (
        <div className={`${cardMuted} text-sm text-zinc-400`}>
          {error}
          <p className="mt-3 text-xs text-zinc-600">
            Charts are generated weekly (Sunday UTC) for the prior week. Use
            the week picker after backfill or cron runs.
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
        />
      ) : null}

      {!props.hideBackLink && (
        <p className="text-xs text-zinc-600">
          <Link href="/you" className="text-emerald-500 hover:underline">
            ← You
          </Link>
        </p>
      )}
    </div>
  );
}
