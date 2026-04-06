import { CommunityListRowSkeleton } from "@/components/skeletons/community-list-row-skeleton";
import { contentMax2xl } from "@/lib/ui/layout";
import { SkeletonBlock } from "@/components/ui/skeleton";

export default function CommunityDetailLoading() {
  return (
    <div className={`${contentMax2xl} space-y-8 py-8`}>
      <SkeletonBlock className="h-4 w-28" />

      <header className="space-y-2 border-b border-zinc-800 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <SkeletonBlock className="h-9 w-64 max-w-full" />
            <SkeletonBlock className="h-4 w-full max-w-lg" />
            <SkeletonBlock className="h-4 w-40" />
          </div>
          <SkeletonBlock className="h-10 w-32 shrink-0 rounded-lg" />
        </div>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-emerald-950/20 to-zinc-950/40 p-4">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-2 h-10 w-36" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-md" />
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-4/5 max-w-xl" />
        <div className="flex gap-3 overflow-hidden pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock
              key={i}
              className={`h-16 w-[140px] shrink-0 rounded-lg ${i >= 3 ? "max-sm:hidden" : ""}`}
            />
          ))}
        </div>
      </section>

      <section>
        <SkeletonBlock className="mb-3 h-7 w-56" />
        <SkeletonBlock className="mb-3 h-3 w-48" />
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CommunityListRowSkeleton
              key={i}
              className={i >= 3 ? "max-md:hidden" : ""}
            />
          ))}
        </ul>
      </section>

      <section>
        <SkeletonBlock className="mb-3 h-7 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2"
            >
              <SkeletonBlock className="h-4 w-full max-w-md" />
              <SkeletonBlock className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
