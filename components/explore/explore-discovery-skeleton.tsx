export function ExploreDiscoverySkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-10 max-w-xl rounded-lg bg-zinc-800/80" />
        <div className="h-10 w-48 rounded-xl bg-zinc-800/80" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-6 w-40 rounded bg-zinc-800/80" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                className="h-36 w-28 shrink-0 rounded-xl bg-zinc-900/80 ring-1 ring-white/[0.06]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
