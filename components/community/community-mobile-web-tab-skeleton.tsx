/** Skeleton placeholders for community mobile web tabs — matches layout density without layout shift. */

export function CommunityMobileVibeTabSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading community vibe">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-800/80" />
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-zinc-900/60 ring-1 ring-white/[0.04]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 animate-pulse rounded-xl bg-zinc-900/60 ring-1 ring-white/[0.04]" />
        <div className="h-28 animate-pulse rounded-xl bg-zinc-900/60 ring-1 ring-white/[0.04]" />
      </div>
      <div className="h-20 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-3/5 max-w-[12rem] animate-pulse rounded bg-zinc-800" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-zinc-800/80" />
          </div>
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
      <div className="h-32 animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
    </div>
  );
}

export function CommunityMobilePeopleTabSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading members"
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="flex min-h-[200px] flex-col items-center rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 ring-1 ring-white/[0.04]"
        >
          <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-800" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-zinc-800/70" />
          <div className="mt-4 w-full border-t border-white/[0.06] pt-3">
            <div className="mx-auto h-2 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mx-auto mt-2 h-4 w-4/5 animate-pulse rounded bg-zinc-800/80" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommunityMobileActivityTabSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading activity">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/30 p-3 ring-1 ring-white/[0.04]"
        >
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
