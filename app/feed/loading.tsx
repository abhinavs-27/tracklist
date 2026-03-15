import { FeedItemSkeleton } from "@/components/skeletons/feed-item-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function FeedLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-24" />
      <ul className="space-y-4 list-none pl-0 m-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <FeedItemSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
