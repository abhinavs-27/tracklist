import { FeedItemSkeleton } from "@/components/skeletons/feed-item-skeleton";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

export function HomeFeedSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <SkeletonBlock className="h-10 w-48 max-w-full rounded-lg" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`min-w-[220px] shrink-0 p-4 ${cardElevated}`}
            >
              <SkeletonBlock className="h-5 w-full rounded-md" />
              <SkeletonBlock className="mt-3 h-4 w-2/3 rounded-md" />
            </div>
          ))}
        </div>
      </div>
      <ul className="m-0 list-none space-y-4 p-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <FeedItemSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
