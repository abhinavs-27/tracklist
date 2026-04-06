import { InlineLoading } from "@/components/ui/loading-states";
import {
  layoutMainColumn,
  layoutMainSidebarGrid,
  layoutSidebarColumn,
} from "@/lib/ui/layout";
import { communityCard } from "@/lib/ui/surface";

/** Loading placeholder for list-style sections (leaderboard, members). */
export function CommunitySectionSkeleton() {
  return (
    <div className={`${communityCard} animate-pulse bg-zinc-900/30`}>
      <div className="mb-4 h-5 w-48 rounded bg-zinc-800/70" />
      <div className="space-y-2.5">
        <div className="h-12 w-full rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
        <div className="h-12 w-full rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04]" />
        <div className="h-12 w-2/3 rounded-xl bg-zinc-800/50 ring-1 ring-white/[0.04] max-md:hidden" />
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
    <div className={layoutMainSidebarGrid}>
      <div className={`${communityCard} ${layoutMainColumn} min-h-[14rem] animate-pulse bg-zinc-900/30`}>
        <div className="mb-4 h-5 w-56 rounded bg-zinc-800/70" />
        <div className="space-y-3">
          <div className="h-24 rounded-lg bg-zinc-800/45" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-28 rounded-xl bg-zinc-800/40" />
            <div className="h-28 rounded-xl bg-zinc-800/40" />
          </div>
        </div>
      </div>
      <div className={`${communityCard} ${layoutSidebarColumn} min-h-[14rem] animate-pulse bg-zinc-900/30`}>
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

/** Hero + ranking rows pulse (use under fixed tabs/week picker while chart fetches). */
export function CommunityBillboardBodySkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-6 ring-1 ring-white/[0.04] sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
          <div className="mx-auto h-40 w-40 shrink-0 rounded-xl bg-zinc-800/60 sm:h-44 sm:w-44" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-4 w-20 rounded bg-zinc-800/50" />
            <div className="h-9 w-3/4 max-w-md rounded bg-zinc-800/55" />
            <div className="h-4 w-1/2 max-w-xs rounded bg-zinc-800/45" />
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-zinc-800/40" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex gap-4 rounded-xl bg-zinc-950/40 p-3 ring-1 ring-white/[0.05] ${i >= 3 ? "max-md:hidden" : ""}`}
          >
            <div className="h-10 w-8 shrink-0 rounded bg-zinc-800/50" />
            <div className="h-14 w-14 shrink-0 rounded-md bg-zinc-800/50" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="h-4 w-2/3 rounded bg-zinc-800/50" />
              <div className="h-3 w-1/3 rounded bg-zinc-800/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Weekly chart block (tabs + week picker + hero + rows). */
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="h-10 max-w-xs animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-800/45" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-800/45" />
        </div>
      </div>
      <CommunityBillboardBodySkeleton />
    </div>
  );
}

/** Mobile tab shell: spinner instead of heavy skeleton (fast tab switch). */
export function CommunityMobileShellSkeleton() {
  return (
    <InlineLoading
      message="Loading community…"
      className="min-h-[12rem] rounded-xl border border-zinc-800/50 bg-zinc-950/25 p-5"
    />
  );
}

/** Desktop sidebar: spinner (non-list widgets). */
export function CommunityDesktopSidebarSkeleton() {
  return (
    <InlineLoading
      message="Loading sidebar…"
      className="min-h-[14rem] rounded-xl border border-zinc-800/40 bg-zinc-950/20 py-10"
    />
  );
}

export function CommunityFeedSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-full max-w-md animate-pulse rounded-full bg-zinc-800/60" />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${communityCard} animate-pulse bg-zinc-900/35 ${i >= 2 ? "max-md:hidden" : ""}`}
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
