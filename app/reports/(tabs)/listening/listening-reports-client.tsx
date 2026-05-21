"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListeningReportShareImageModal } from "@/components/reports/listening-report-share-image";
import { ShareReportModal } from "@/components/reports/share-report-modal";
import type { ListeningReportShareCardRow } from "@/components/reports/listening-report-share-card";
import { useToast } from "@/components/toast";

type EntityType = "artist" | "album" | "track" | "genre";
type Range = "week" | "month" | "year" | "custom";

type ReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  rank: number;
  previousRank: number | null;
  movement: number | null;
  isNew: boolean;
};

type ReportPayload = {
  items: ReportItem[];
  range: Range;
  periodLabel: string;
  nextOffset: number | null;
};

type ComparePayload = {
  totalPlaysCurrent: number;
  totalPlaysPrevious: number;
  percentChange: number | null;
  topGainer: { entityId: string; name: string } | null;
  topDropper: { entityId: string; name: string } | null;
};

type SavedReportRow = {
  id: string;
  name: string;
  entity_type: string;
  range_type: string;
  start_date: string | null;
  end_date: string | null;
  is_public: boolean;
  created_at: string;
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

function formatMovement(m: number | null, isNew: boolean): string {
  if (isNew) return "—";
  if (m == null || m === 0) return "—";
  if (m > 0) return `↑ +${m}`;
  return `↓ ${m}`;
}


export function ListeningReportsClient(props: { userId: string; username?: string }) {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("week");
  const [entityType, setEntityType] = useState<EntityType>("artist");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<ReportPayload | null>(null);
  const [compare, setCompare] = useState<ComparePayload | null>(null);
  const [saved, setSaved] = useState<SavedReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unified share modal (current unsaved report)
  const [shareReportModalOpen, setShareReportModalOpen] = useState(false);
  // Legacy image-only modal (saved reports in history)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModal, setShareModal] = useState<{
    reportTitle: string;
    periodLabel: string;
    entityLabel: string;
    rows: ListeningReportShareCardRow[];
    shareUrl: string | null;
  } | null>(null);
  const [sharingSavedId, setSharingSavedId] = useState<string | null>(null);
  const fetchGenRef = useRef(0);
  /** Cleared when range / type / custom dates change; avoids repeat warm+refetch loops. */
  const catalogWarmAttemptedIdsRef = useRef<Set<string>>(new Set());

  function rowsForShare(items: ReportItem[]): ListeningReportShareCardRow[] {
    return items.slice(0, 5).map((r) => ({
      rank: r.rank,
      name: r.name,
      image: r.image,
      count: r.count,
    }));
  }

  function entityTypeLabel(t: EntityType | string): string {
    const m = TYPES.find((x) => x.value === t);
    return m ? m.label : String(t);
  }

  function defaultReportName(): string {
    const label = entityTypeLabel(entityType);
    if (data?.periodLabel) return `Top ${label} · ${data.periodLabel}`;
    const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? range;
    return `Top ${label} · ${rangeLabel}`;
  }

  function openShareFromCurrent() {
    if (!data?.items.length) return;
    setShareReportModalOpen(true);
  }

  async function openShareFromSaved(row: SavedReportRow) {
    if (!row.start_date || !row.end_date) return;
    setSharingSavedId(row.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/saved/${encodeURIComponent(row.id)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { payload?: ReportPayload; error?: string }
        | null;
      if (!res.ok) {
        setError(
          json?.error ?? "Could not load report",
        );
        return;
      }
      const payload = json?.payload;
      if (!payload?.items?.length) {
        setError("No data for this saved report.");
        return;
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setShareModal({
        reportTitle: row.name,
        periodLabel: payload.periodLabel,
        entityLabel: entityTypeLabel(row.entity_type),
        rows: rowsForShare(payload.items),
        shareUrl: `${origin}/reports/shared/${row.id}`,
      });
      setShareModalOpen(true);
    } finally {
      setSharingSavedId(null);
    }
  }

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/reports/saved?userId=${encodeURIComponent(props.userId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { items?: SavedReportRow[] }
        | { error?: string };
      if (!res.ok) return;
      setSaved((json as { items?: SavedReportRow[] }).items ?? []);
    } catch {
      /* ignore */
    }
  }, [props.userId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const deleteSaved = useCallback(
    async (reportId: string, reportName: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(`Delete “${reportName}”?`)
      ) {
        return;
      }
      setDeletingId(reportId);
      try {
        const res = await fetch(`/api/reports/saved/${reportId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string };
          setError(j?.error ?? "Could not delete report");
          return;
        }
        setError(null);
        await loadSaved();
      } finally {
        setDeletingId(null);
      }
    },
    [loadSaved],
  );

  const loadCompare = useCallback(async () => {
    if (range === "custom") {
      setCompare(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/reports/compare?userId=${encodeURIComponent(props.userId)}&range=${range}&type=${entityType}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | ComparePayload
        | { error?: string };
      if (!res.ok) {
        setCompare(null);
        return;
      }
      setCompare(json as ComparePayload);
    } catch {
      setCompare(null);
    }
  }, [props.userId, range, entityType]);

  useEffect(() => {
    void loadCompare();
  }, [loadCompare]);

  useEffect(() => {
    catalogWarmAttemptedIdsRef.current.clear();
  }, [range, entityType, startDate, endDate]);

  const load = useCallback(
    async (opts: {
      range: Range;
      entityType: EntityType;
      offset: number;
      append: boolean;
      startDate?: string;
      endDate?: string;
      /** Default 50; use up to 100 after catalog warm to refetch a longer first view. */
      limit?: number;
    }) => {
      const gen = ++fetchGenRef.current;
      setLoading(true);
      setError(null);
      try {
        const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
        const q = new URLSearchParams({
          userId: props.userId,
          type: opts.entityType,
          range: opts.range,
          limit: String(limit),
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

  const loadingMore = loading && data !== null && (data?.nextOffset != null);
  const showInitialSkeleton = data === null && loading;
  // Keep old list visible but dimmed while reloading a new range/type
  const reloading = loading && data !== null;

  useEffect(() => {
    if (range === "custom") return;
    void load({ range, entityType, offset: 0, append: false });
  }, [range, entityType, load]);

  /** After first paint, warm missing catalog metadata from Spotify, then refetch (≤100 rows) so images fill in. */
  useEffect(() => {
    if (!data || loading || entityType === "genre") return;
    const missing = data.items.filter(
      (i) =>
        !i.image && !catalogWarmAttemptedIdsRef.current.has(i.entityId),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const ids = missing.map((i) => i.entityId);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const res = await fetch("/api/reports/warm-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityIds: chunk }),
        });
        if (!res.ok || cancelled) return;
        chunk.forEach((id) => catalogWarmAttemptedIdsRef.current.add(id));
      }
      if (cancelled) return;
      if (data.items.length > 100) return;
      await load({
        range,
        entityType,
        offset: 0,
        append: false,
        startDate: range === "custom" ? startDate : undefined,
        endDate: range === "custom" ? endDate : undefined,
        limit: Math.min(100, Math.max(50, data.items.length)),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    data,
    loading,
    entityType,
    range,
    startDate,
    endDate,
    load,
  ]);

  function selectRange(next: Range) {
    setData(null);
    setRange(next);
    if (next === "custom") {
      setError(null);
    }
  }

  function selectEntity(next: EntityType) {
    setData(null);
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

  const reportRows = data?.items ?? [];
  const reportListParentRef = useRef<HTMLDivElement>(null);
  const reportSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const reportVirtualizer = useVirtualizer({
    count: reportRows.length,
    getScrollElement: () => reportListParentRef.current,
    estimateSize: () => 76,
    overscan: 6,
    getItemKey: (index) => {
      const row = reportRows[index];
      return row ? `${row.entityId}-${row.rank}` : String(index);
    },
  });

  useEffect(() => {
    const root = reportListParentRef.current;
    const target = reportSentinelRef.current;
    if (!root || !target || data?.nextOffset == null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { root, rootMargin: "320px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [data?.nextOffset, reportRows.length]);

  async function savePrivate() {
    const name = defaultReportName();
    setSavingPrivate(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, type: entityType, range, isPublic: false };
      if (range === "custom") { body.startDate = startDate; body.endDate = endDate; }
      const res = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { id?: string; error?: string };
      if (!res.ok) { setError(json?.error ?? "Could not save report"); return; }
      await loadSaved();
      toast("Report saved");
    } finally {
      setSavingPrivate(false);
    }
  }

  async function savePublicForModal(name: string): Promise<{ url: string } | null> {
    const body: Record<string, unknown> = { name, type: entityType, range, isPublic: true };
    if (range === "custom") { body.startDate = startDate; body.endDate = endDate; }
    const res = await fetch("/api/reports/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; error?: string };
    if (!res.ok || !json?.id) return null;
    void loadSaved();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return { url: `${origin}/reports/shared/${json.id}` };
  }

  const topGainerMovement = compare?.topGainer
    ? (data?.items.find((r) => r.entityId === compare.topGainer!.entityId)?.movement ?? null)
    : null;
  const topDropperMovement = compare?.topDropper
    ? (data?.items.find((r) => r.entityId === compare.topDropper!.entityId)?.movement ?? null)
    : null;

  const statStrip =
    compare && range !== "custom" ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total plays */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Total plays</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{compare.totalPlaysCurrent.toLocaleString()}</p>
          {compare.percentChange != null && (
            <p className={`mt-0.5 text-xs font-medium ${compare.percentChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {compare.percentChange >= 0 ? "↑" : "↓"} {compare.percentChange >= 0 ? "+" : ""}{compare.percentChange.toFixed(0)}% vs prior
            </p>
          )}
        </div>
        {/* Top gainer */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Top gainer</p>
          {compare.topGainer ? (
            <>
              <p className="mt-1.5 text-sm font-bold leading-tight text-white">{compare.topGainer.name}</p>
              <p className="mt-0.5 text-xs font-medium text-emerald-400">{topGainerMovement != null ? `+${topGainerMovement} spots` : "—"}</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-zinc-500">—</p>
          )}
        </div>
        {/* New entries */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">New entries</p>
          <p className="mt-1.5 text-2xl font-bold text-white">
            {data?.items.filter((r) => r.isNew).length ?? 0}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">not in prior period</p>
        </div>
        {/* Top dropper */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Top dropper</p>
          {compare.topDropper ? (
            <>
              <p className="mt-1.5 text-sm font-bold leading-tight text-white">{compare.topDropper.name}</p>
              <p className="mt-0.5 text-xs font-medium text-red-400">{topDropperMovement != null ? `${topDropperMovement} spots` : "—"}</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-zinc-500">—</p>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-8">
      {statStrip}

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

      <div className="space-y-4">
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

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => openShareFromCurrent()}
            disabled={
              loading ||
              (range === "custom" && (!startDate || !endDate)) ||
              !data?.items.length
            }
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
          >
            Share report
          </button>
          <button
            type="button"
            onClick={() => void savePrivate()}
            disabled={
              savingPrivate ||
              loading ||
              (range === "custom" && (!startDate || !endDate)) ||
              !data?.items.length
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 sm:w-auto"
            title="Save a private copy you can access later. Not shared publicly."
          >
            {savingPrivate ? "Saving…" : "Save privately"}
          </button>
        </div>
      </div>

      {saved.length > 0 ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">
            Saved reports
          </h2>
          <ul className="space-y-1 text-sm">
            {saved.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md py-0.5 pl-1 pr-0 hover:bg-zinc-800/50"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/reports/shared/${s.id}`}
                    className="text-emerald-400 hover:underline"
                  >
                    {s.name}
                  </Link>
                  {s.is_public ? (
                    <span className="ml-1.5 inline-block align-middle rounded-md border border-emerald-800/60 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/95">
                      Link
                    </span>
                  ) : null}
                  <span className="text-zinc-500">
                    {" "}
                    · {s.entity_type} · {s.range_type}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void openShareFromSaved(s)}
                  disabled={sharingSavedId === s.id || deletingId === s.id}
                  className="shrink-0 rounded p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-emerald-400 disabled:opacity-40"
                  title="Share image"
                  aria-label={`Share image for ${s.name}`}
                >
                  {sharingSavedId === s.id ? (
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
                      aria-hidden
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect width="18" height="14" x="3" y="3" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSaved(s.id, s.name)}
                  disabled={deletingId === s.id}
                  className="shrink-0 rounded p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"
                  aria-label={`Delete saved report ${s.name}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        className={`min-h-[120px] transition-opacity duration-150 ${reloading ? "opacity-40 pointer-events-none" : "opacity-100"}`}
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
          <div
            ref={reportListParentRef}
            className="max-h-[min(70vh,640px)] overflow-auto"
            aria-busy={loadingMore}
            role="list"
          >
            <div
              style={{
                height: `${reportVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {reportVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = reportRows[virtualRow.index];
                if (!row) return null;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={reportVirtualizer.measureElement}
                    role="listitem"
                    className={`pb-2 ${loadingMore ? "opacity-60" : ""}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className={`flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 transition ${
                        row.isNew ? "border-violet-500/30 bg-violet-950/20" : ""
                      }`}
                    >
                      <span className="w-8 text-sm tabular-nums text-zinc-500">
                        {row.rank}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-white">{row.name}</p>
                          {row.isNew ? (
                            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                              New
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-zinc-500">{row.count} plays</p>
                      </div>
                      <span
                        className={`shrink-0 text-sm tabular-nums ${
                          row.movement != null && row.movement > 0
                            ? "text-emerald-400"
                            : row.movement != null && row.movement < 0
                              ? "text-red-400"
                              : "text-zinc-500"
                        }`}
                      >
                        {formatMovement(row.movement, row.isNew)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.nextOffset != null ? (
              <div
                ref={reportSentinelRef}
                className="flex min-h-12 items-center justify-center py-4"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2 text-sm text-zinc-500">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
                      aria-hidden
                    />
                    Loading…
                  </span>
                ) : (
                  <span className="sr-only">Scroll for more</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {shareModal && (
        <ListeningReportShareImageModal
          open={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareModal(null);
          }}
          reportTitle={shareModal.reportTitle}
          periodLabel={shareModal.periodLabel}
          entityLabel={shareModal.entityLabel}
          rows={shareModal.rows}
          shareUrl={shareModal.shareUrl}
        />
      )}

      {data && shareReportModalOpen && (
        <ShareReportModal
          open={shareReportModalOpen}
          onClose={() => setShareReportModalOpen(false)}
          defaultName={defaultReportName()}
          periodLabel={data.periodLabel}
          entityLabel={entityTypeLabel(entityType)}
          rows={rowsForShare(data.items)}
          ownerHandle={props.username ?? null}
          totalPlays={compare?.totalPlaysCurrent ?? null}
          onSavePublic={(name) => savePublicForModal(name)}
        />
      )}
    </div>
  );
}
