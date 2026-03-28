/** Loading placeholder for Suspense-bound community sections. */
export function CommunitySectionSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4">
      <div className="mb-3 h-5 w-48 animate-pulse rounded bg-zinc-800/70" />
      <div className="space-y-2">
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-12 w-2/3 animate-pulse rounded-lg bg-zinc-800/50" />
      </div>
    </div>
  );
}

export function CommunityFeedSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-full max-w-md animate-pulse rounded-full bg-zinc-800/60" />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4"
        >
          <div className="flex gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-800/70" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800/60" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-800/40" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
