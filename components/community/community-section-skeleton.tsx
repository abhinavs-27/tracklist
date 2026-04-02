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

/** Taste match card placeholder (desktop grid cell). */
export function CommunityMatchSkeleton() {
  return (
    <div className="h-28 animate-pulse rounded-xl bg-zinc-900/50 ring-1 ring-white/[0.04]" />
  );
}

/** Insights + weekly summary two-column pulse block. */
export function CommunityPulseSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
      <div className={`${communityCard} min-h-[14rem] animate-pulse bg-zinc-900/30`}>
        <div className="mb-4 h-5 w-56 rounded bg-zinc-800/70" />
        <div className="space-y-3">
          <div className="h-24 rounded-lg bg-zinc-800/45" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 rounded-xl bg-zinc-800/40" />
            <div className="h-28 rounded-xl bg-zinc-800/40" />
          </div>
        </div>
      </div>
      <div className={`${communityCard} min-h-[14rem] animate-pulse bg-zinc-900/30`}>
        <div className="mb-4 h-5 w-40 rounded bg-zinc-800/70" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-full rounded-lg bg-zinc-800/45" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Weekly chart block (tabs + week picker + body). */
export function CommunityBillboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 w-24 animate-pulse rounded-full bg-zinc-800/60"
          />
        ))}
      </div>
      <div className="h-10 max-w-xs animate-pulse rounded-lg bg-zinc-800/50" />
      <div className="min-h-[12rem] animate-pulse rounded-xl bg-zinc-900/40 ring-1 ring-white/[0.04]" />
    </div>
  );
}

/** Mobile tab shell (tabs + first panel). */
export function CommunityMobileShellSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 rounded-xl bg-zinc-900/50 p-1 ring-1 ring-white/[0.06]">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 flex-1 animate-pulse rounded-lg bg-zinc-800/60"
          />
        ))}
      </div>
      <div className="min-h-[min(76dvh,calc(100dvh-17rem))] animate-pulse rounded-xl bg-zinc-900/40 ring-1 ring-white/[0.04]" />
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
