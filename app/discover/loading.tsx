import { SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";

export default function DiscoverLoading() {
  return (
    <div className="space-y-10">
      <section>
        <SkeletonBlock className="mb-3 h-6 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={100} lines={2} />
          ))}
        </div>
      </section>

      <section>
        <SkeletonBlock className="mb-3 h-6 w-36" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={100} lines={1} />
          ))}
        </div>
      </section>

      <section>
        <SkeletonBlock className="mb-3 h-6 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
              <SkeletonBlock className="h-4 flex-1 max-w-[40%]" />
              <SkeletonBlock className="h-4 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <SkeletonBlock className="mb-3 h-6 w-36" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={80} lines={2} />
          ))}
        </div>
      </section>
    </div>
  );
}
