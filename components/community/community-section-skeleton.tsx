import { communityCard } from "@/lib/ui/surface";

/** Loading placeholder for Suspense-bound community sections. */
export function CommunitySectionSkeleton() {
  return (
    <div className={`${communityCard} animate-pulse bg-zinc-900/30`}>
      <div className="mb-4 h-5 w-48 rounded bg-zinc-800/70" />
      <div className="space-y-2.5">
        <div className="h-12 w-full rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
        <div className="h-12 w-full rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
        <div className="h-12 w-2/3 rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
      </div>
    </div>
  );
}

export function CommunityFeedSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-full max-w-md animate-pulse rounded-full bg-zinc-800/60" />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${communityCard} animate-pulse bg-zinc-900/35`}
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
