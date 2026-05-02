"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardEntry } from "@/lib/queries";

// ── Types ──────────────────────────────────────────────────────────────────

type Entity = "album" | "track";
type Sort = "popular" | "topRated" | "mostFavorited";
type Era = "all" | "2020s" | "2010s" | "2000s" | "1990s" | "1980s" | "1970s" | "older" | "custom";

// ── Helpers ────────────────────────────────────────────────────────────────

function eraToYears(era: Era, customFrom: string, customTo: string): { startYear?: number; endYear?: number } {
  if (era === "custom") {
    const from = parseInt(customFrom, 10);
    const to = parseInt(customTo, 10);
    return {
      startYear: isNaN(from) ? undefined : from,
      endYear: isNaN(to) ? undefined : to,
    };
  }
  const map: Record<string, { startYear: number; endYear: number }> = {
    "2020s": { startYear: 2020, endYear: 2029 },
    "2010s": { startYear: 2010, endYear: 2019 },
    "2000s": { startYear: 2000, endYear: 2009 },
    "1990s": { startYear: 1990, endYear: 1999 },
    "1980s": { startYear: 1980, endYear: 1989 },
    "1970s": { startYear: 1970, endYear: 1979 },
    "older": { startYear: 1900, endYear: 1969 },
  };
  return map[era] ?? {};
}

function buildApiUrl(
  entity: Entity,
  sort: Sort,
  era: Era,
  customFrom: string,
  customTo: string,
  cursor: number,
): string {
  const params = new URLSearchParams({
    type: sort,
    entity: entity === "track" ? "song" : "album",
    limit: "48",
    lite: "true",
  });
  if (cursor > 0) params.set("cursor", String(cursor));
  const { startYear, endYear } = eraToYears(era, customFrom, customTo);
  if (startYear) params.set("startYear", String(startYear));
  if (endYear) params.set("endYear", String(endYear));
  return `/api/leaderboard?${params.toString()}`;
}

function buildPageUrl(entity: Entity, sort: Sort, era: Era, customFrom: string, customTo: string): string {
  const params = new URLSearchParams();
  if (entity !== "album") params.set("entity", entity);
  if (sort !== "popular") params.set("sort", sort);
  if (era !== "all") params.set("era", era);
  if (era === "custom") {
    if (customFrom) params.set("from", customFrom);
    if (customTo) params.set("to", customTo);
  }
  const q = params.toString();
  return q ? `/browse?${q}` : "/browse";
}

function metaLabel(entry: LeaderboardEntry, sort: Sort): string {
  if (sort === "topRated" && entry.average_rating != null) {
    return `★ ${entry.average_rating.toFixed(1)}`;
  }
  if (sort === "mostFavorited") {
    const fav = entry.favorite_count != null ? `♡ ${entry.favorite_count.toLocaleString()}` : null;
    const plays = entry.total_plays > 0 ? `${entry.total_plays.toLocaleString()} plays` : null;
    return [fav, plays].filter(Boolean).join(" · ");
  }
  return `${entry.total_plays.toLocaleString()} plays`;
}

const CURRENT_YEAR = new Date().getFullYear();

// ── Card ──────────────────────────────────────────────────────────────────

function BrowseCard({ entry, sort, rank }: { entry: LeaderboardEntry; sort: Sort; rank: number }) {
  const href = entry.entity_type === "album" ? `/album/${entry.id}` : `/song/${entry.id}`;
  return (
    <Link href={href} className="group relative block">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/[0.18] group-hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]">
        {entry.artwork_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.artwork_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600 text-xl">♪</div>
        )}
        {/* Rank */}
        <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/75 backdrop-blur-sm">
          {rank}
        </div>
        {/* Hover info */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2 opacity-0 transition duration-200 group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{entry.name}</p>
          <p className="mt-0.5 line-clamp-1 text-[10px] text-zinc-300">{entry.artist}</p>
          <p className="mt-1 text-[10px] font-medium text-emerald-400">{metaLabel(entry, sort)}</p>
        </div>
      </div>
    </Link>
  );
}

// ── Select helper ─────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg bg-zinc-800/70 py-2 pl-3 pr-8 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-zinc-700/70 focus:outline-none focus:ring-emerald-500/50 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden
      >
        <path d="M4.427 6.427a.75.75 0 011.06 0L8 8.94l2.513-2.513a.75.75 0 111.06 1.06l-3.043 3.044a.75.75 0 01-1.06 0L4.427 7.487a.75.75 0 010-1.06z" />
      </svg>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

type ApiResponse = {
  items: LeaderboardEntry[];
  nextCursor: number | null;
  total: number | null;
};

export function BrowseGrid({
  initialEntity,
  initialSort,
  initialEra,
  initialCustomFrom,
  initialCustomTo,
}: {
  initialEntity: Entity;
  initialSort: Sort;
  initialEra: Era;
  initialCustomFrom: string;
  initialCustomTo: string;
}) {
  const router = useRouter();

  const [entity, setEntity] = useState<Entity>(initialEntity);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [era, setEra] = useState<Era>(initialEra);
  const [customFrom, setCustomFrom] = useState(initialCustomFrom);
  const [customTo, setCustomTo] = useState(initialCustomTo);

  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pushUrl = useCallback((e: Entity, s: Sort, er: Era, cf: string, ct: string) => {
    router.replace(buildPageUrl(e, s, er, cf, ct), { scroll: false });
  }, [router]);

  const applyFilters = (e: Entity, s: Sort, er: Era, cf: string, ct: string) => {
    setEntity(e); setSort(s); setEra(er); setCustomFrom(cf); setCustomTo(ct);
    pushUrl(e, s, er, cf, ct);
  };

  // Fetch on filter change
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setItems([]);
    setNextCursor(null);

    fetch(buildApiUrl(entity, sort, era, customFrom, customTo, 0), { signal: ac.signal })
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        if (ac.signal.aborted) return;
        setItems(data.items ?? []);
        setNextCursor(data.nextCursor ?? null);
        setTotal(data.total ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });

    return () => ac.abort();
  }, [entity, sort, era, customFrom, customTo]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetch(buildApiUrl(entity, sort, era, customFrom, customTo, nextCursor))
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setItems((prev) => [...prev, ...(data.items ?? [])]);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [entity, sort, era, customFrom, customTo, nextCursor, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const sortOptions = [
    { label: "Most played", value: "popular" },
    { label: "Top rated", value: "topRated" },
    { label: "Most favorited", value: "mostFavorited" },
  ];

  const eraOptions = [
    { label: "All time", value: "all" },
    { label: "2020s", value: "2020s" },
    { label: "2010s", value: "2010s" },
    { label: "2000s", value: "2000s" },
    { label: "1990s", value: "1990s" },
    { label: "1980s", value: "1980s" },
    { label: "1970s", value: "1970s" },
    { label: "Before 1970", value: "older" },
    { label: "Custom year range…", value: "custom" },
  ];

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="space-y-3">
        {/* Row 1: entity toggle + sort + era in one line on desktop */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Entity toggle */}
          <div className="flex rounded-lg bg-zinc-800/60 p-0.5 ring-1 ring-white/[0.06]">
            {(["album", "track"] as Entity[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => applyFilters(e, sort, era, customFrom, customTo)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  entity === e
                    ? "bg-zinc-100 text-zinc-900 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {e === "album" ? "Albums" : "Tracks"}
              </button>
            ))}
          </div>

          {/* Sort select */}
          <FilterSelect
            value={sort}
            onChange={(v) => applyFilters(entity, v as Sort, era, customFrom, customTo)}
            options={sortOptions}
            className="w-40"
          />

          {/* Era select */}
          <FilterSelect
            value={era}
            onChange={(v) => applyFilters(entity, sort, v as Era, customFrom, customTo)}
            options={eraOptions}
            className="w-44"
          />
        </div>

        {/* Custom year range — only shown when era === "custom" */}
        {era === "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">From</span>
            <input
              type="number"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              onBlur={() => applyFilters(entity, sort, era, customFrom, customTo)}
              placeholder="1990"
              min="1900"
              max={CURRENT_YEAR}
              className="w-24 rounded-lg bg-zinc-800/70 px-3 py-2 text-sm text-white ring-1 ring-white/[0.08] focus:outline-none focus:ring-emerald-500/50"
            />
            <span className="text-sm text-zinc-500">to</span>
            <input
              type="number"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              onBlur={() => applyFilters(entity, sort, era, customFrom, customTo)}
              placeholder={String(CURRENT_YEAR)}
              min="1900"
              max={CURRENT_YEAR}
              className="w-24 rounded-lg bg-zinc-800/70 px-3 py-2 text-sm text-white ring-1 ring-white/[0.08] focus:outline-none focus:ring-emerald-500/50"
            />
            <button
              type="button"
              onClick={() => applyFilters(entity, sort, era, customFrom, customTo)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Apply
            </button>
          </div>
        )}

        {/* Result count */}
        {!loading && (
          <p className="text-xs text-zinc-600">
            {items.length.toLocaleString()}
            {total != null && total > items.length ? ` of ${total.toLocaleString()}` : ""}
            {" "}{entity === "album" ? "albums" : "tracks"}
            {era !== "all" && era !== "custom" ? ` · ${era}` : ""}
            {era === "custom" && customFrom && customTo ? ` · ${customFrom}–${customTo}` : ""}
          </p>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No results for this combination yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {items.map((entry, i) => (
              <BrowseCard
                key={`${entry.entity_type}-${entry.id}`}
                entry={entry}
                sort={sort}
                rank={i + 1}
              />
            ))}
          </div>
          {nextCursor && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <span className="text-sm text-zinc-500">Loading…</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
