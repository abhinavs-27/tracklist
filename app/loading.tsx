import { SkeletonAvatar, SkeletonBlock } from "@/components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={36} />
        <SkeletonBlock className="h-4 flex-1 max-w-[120px]" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <SkeletonAvatar size={36} />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-3/4" />
              <div className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                <SkeletonBlock className="h-12 w-12 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-1">
                  <SkeletonBlock className="h-4 w-2/3" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>
              </div>
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
