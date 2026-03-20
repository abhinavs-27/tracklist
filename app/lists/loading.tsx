import { SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";

export default function ListsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SkeletonBlock className="h-9 w-48" />
      <SkeletonBlock className="h-4 w-full max-w-md" />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
        <SkeletonBlock className="h-4 w-28" />
      </div>
      <section>
        <SkeletonBlock className="mb-3 h-6 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <SkeletonBlock className="h-5 w-3/4" />
              <SkeletonBlock className="mt-2 h-3 w-full" />
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
