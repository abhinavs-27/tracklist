import { FeedItemSkeleton } from "@/components/skeletons/feed-item-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { sectionGap } from "@/lib/ui/surface";

export default function FeedLoading() {
  return (
    <div className={sectionGap}>
      <div>
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="mt-2 h-5 w-64 max-w-full rounded-md" />
      </div>
      <ul className="m-0 list-none space-y-4 p-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <FeedItemSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
