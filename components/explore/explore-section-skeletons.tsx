/**
 * Pulse skeletons for Explore hub section Suspense fallbacks (no record spinner).
 */

export function ExploreTrendingSectionSkeleton() {
  return (
    <div
      className="animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-950/25 py-4"
      role="status"
      aria-label="Loading trending"
    >
      <div className="-mx-1 flex gap-3 overflow-hidden px-1 pt-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-[7.25rem] w-[7.25rem] shrink-0 rounded-xl bg-zinc-900/55 ring-1 ring-white/[0.04] sm:h-32 sm:w-32 ${i >= 4 ? "max-sm:hidden" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export function ExploreLeaderboardSectionSkeleton() {
  return (
    <ol
      className="animate-pulse space-y-2"
      role="status"
      aria-label="Loading leaderboard"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 rounded-xl bg-zinc-900/45 px-3 py-2.5 ring-1 ring-white/[0.04] ${i >= 3 ? "max-sm:hidden" : ""}`}
        >
          <div className="h-4 w-6 shrink-0 rounded bg-zinc-800/60" />
          <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-800/55" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-[60%] max-w-xs rounded bg-zinc-800/55" />
            <div className="h-3 w-[40%] max-w-[10rem] rounded bg-zinc-800/40" />
          </div>
          <div className="h-3 w-10 shrink-0 rounded bg-zinc-800/45" />
        </li>
      ))}
    </ol>
  );
}

export function ExploreReviewsSectionSkeleton() {
  return (
    <ul
      className="animate-pulse space-y-2"
      role="status"
      aria-label="Loading reviews"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className={`flex flex-col gap-2 rounded-xl bg-zinc-900/45 px-3 py-2.5 ring-1 ring-white/[0.04] sm:flex-row sm:items-center sm:justify-between ${i >= 2 ? "max-sm:hidden" : ""}`}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-[70%] rounded bg-zinc-800/55" />
            <div className="h-3 w-[45%] rounded bg-zinc-800/40" />
          </div>
          <div className="h-4 w-12 shrink-0 rounded bg-zinc-800/45 sm:self-center" />
        </li>
      ))}
    </ul>
  );
}

/** Matches DiscoverTastePreview / TasteCard footprint. */
export function ExploreTastePreviewSkeleton() {
  return (
    <section
      className="animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-4"
      role="status"
      aria-label="Loading taste preview"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="h-4 w-28 rounded bg-zinc-800/60" />
        <div className="h-3 w-20 rounded bg-zinc-800/45" />
      </div>
      <div className="space-y-3 rounded-lg bg-zinc-900/40 p-4 ring-1 ring-white/[0.04]">
        <div className="h-5 w-36 rounded bg-zinc-800/55" />
        <div className="h-4 w-full rounded bg-zinc-800/40" />
        <div className="h-4 w-[92%] rounded bg-zinc-800/35" />
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-6 w-14 rounded-full bg-zinc-800/50" />
          <div className="h-6 w-20 rounded-full bg-zinc-800/45" />
          <div className="h-6 w-16 rounded-full bg-zinc-800/40" />
        </div>
      </div>
    </section>
  );
}
