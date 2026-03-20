import { SkeletonAvatar, SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SkeletonAvatar size={96} />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-8 w-40" />
          <SkeletonBlock className="h-4 w-full max-w-md" />
          <div className="flex gap-4 pt-2">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <SkeletonBlock className="mb-3 h-6 w-36" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={100} lines={1} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <SkeletonBlock className="mb-3 h-6 w-28" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <SkeletonAvatar size={36} />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
