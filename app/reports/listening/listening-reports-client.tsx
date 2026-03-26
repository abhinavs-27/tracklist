"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EntityType = "artist" | "album" | "track" | "genre";
type Range = "week" | "month" | "year" | "custom";

type ReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
};

type ReportPayload = {
  items: ReportItem[];
  range: Range;
  periodLabel: string;
  nextOffset: number | null;
};

const RANGES: { value: Range; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

const TYPES: { value: EntityType; label: string }[] = [
  { value: "artist", label: "Artists" },
  { value: "album", label: "Albums" },
  { value: "track", label: "Tracks" },
  { value: "genre", label: "Genres" },
];

export function ListeningReportsClient(props: { userId: string }) {
  const [range, setRange] = useState<Range>("week");
  const [entityType, setEntityType] = useState<EntityType>("artist");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const load = useCallback(
    async (opts: {
      range: Range;
      entityType: EntityType;
      offset: number;
      append: boolean;
      startDate?: string;
      endDate?: string;
    }) => {
      const gen = ++fetchGenRef.current;
      if (!opts.append) {
        setData(null);
      }
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({
          userId: props.userId,
          type: opts.entityType,
          range: opts.range,
          limit: "50",
          offset: String(opts.offset),
        });
        if (opts.range === "custom" && opts.startDate && opts.endDate) {
          q.set("startDate", opts.startDate);
          q.set("endDate", opts.endDate);
        }
        const res = await fetch(`/api/reports?${q.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | ReportPayload
          | { error?: string };
        if (gen !== fetchGenRef.current) return;
        if (!res.ok) {
          setError(
            (json as { error?: string })?.error ?? "Could not load reports",
          );
          return;
        }
        const payload = json as ReportPayload;
        setData((prev) => {
          if (opts.append && prev) {
            return {
              ...payload,
              items: [...prev.items, ...payload.items],
            };
          }
          return payload;
        });
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
        }
      }
    },
    [props.userId],
  );

  const loadingMore = loading && data !== null;
  const showInitialSkeleton = loading && data === null;

  useEffect(() => {
    if (range === "custom") return;
    void load({ range, entityType, offset: 0, append: false });
  }, [range, entityType, load]);

  function selectRange(next: Range) {
    setRange(next);
    if (next === "custom") {
      setData(null);
      setError(null);
    }
  }

  function selectEntity(next: EntityType) {
    setEntityType(next);
    if (range === "custom" && startDate && endDate) {
      void load({
        range: "custom",
        entityType: next,
        offset: 0,
        append: false,
        startDate,
        endDate,
      });
    }
  }

  function applyCustom() {
    void load({
      range: "custom",
      entityType,
      offset: 0,
      append: false,
      startDate,
      endDate,
    });
  }

  function loadMore() {
    if (!data?.nextOffset) return;
    void load({
      range,
      entityType,
      offset: data.nextOffset,
      append: true,
      startDate: range === "custom" ? startDate : undefined,
      endDate: range === "custom" ? endDate : undefined,
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => selectRange(r.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              range === r.value
                ? "bg-emerald-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range === "custom" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-400">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-white"
            />
          </label>
          <label className="text-sm text-zinc-400">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => applyCustom()}
            disabled={!startDate || !endDate || loading}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => selectEntity(t.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              entityType === t.value
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data ? (
        <p className="text-sm text-zinc-500">{data.periodLabel}</p>
      ) : range === "custom" && !showInitialSkeleton ? (
        <p className="text-sm text-zinc-500">
          Pick a date range and apply to load custom stats.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : null}

      <div
        aria-busy={loading}
        aria-live="polite"
        className="min-h-[120px]"
      >
        {showInitialSkeleton ? (
          <ol className="space-y-2" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
              >
                <span className="w-8 rounded bg-zinc-800 py-3" />
                <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 max-w-[60%] rounded bg-zinc-800" />
                  <div className="h-3 w-16 rounded bg-zinc-800/80" />
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {data && data.items.length === 0 && !loading ? (
          <p className="text-zinc-500">No plays in this period yet.</p>
        ) : null}

        {data && data.items.length > 0 ? (
          <ol className="space-y-2">
            {data.items.map((row, i) => (
              <li
                key={`${row.entityId}-${i}`}
                className={`flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 transition ${
                  loadingMore ? "opacity-60" : ""
                }`}
              >
                <span className="w-8 text-sm tabular-nums text-zinc-500">
                  {i + 1}
                </span>
                {row.image ? (
                  <img
                    src={row.image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                    ♪
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="text-xs text-zinc-500">{row.count} plays</p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {data?.nextOffset != null ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadMore()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
                  aria-hidden
                />
                Loading…
              </span>
            ) : (
              "Load more"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
