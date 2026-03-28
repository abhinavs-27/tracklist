import { FeedItemSkeleton } from "@/components/skeletons/feed-item-skeleton";
import { SkeletonAvatar, SkeletonBlock } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

export default function GlobalLoading() {
  return (
    <div className="space-y-8 py-2">
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <SkeletonBlock className="h-5 w-40 max-w-[50%] rounded-lg" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex gap-3 p-4 ${cardElevated}`}>
            <SkeletonAvatar size={36} />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-3/4 rounded-md" />
              <div
                className={`flex gap-3 rounded-xl bg-zinc-950/35 p-2 ring-1 ring-inset ring-white/[0.05]`}
              >
                <SkeletonBlock className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <SkeletonBlock className="h-4 w-2/3 rounded-md" />
                  <SkeletonBlock className="h-3 w-1/2 rounded-md" />
                </div>
              </div>
              <SkeletonBlock className="h-3 w-24 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
