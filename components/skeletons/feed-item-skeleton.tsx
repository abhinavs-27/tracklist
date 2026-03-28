import { Skeleton } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

/** Matches FeedItem (listen summary style): avatar, user line, track card block. */
export function FeedItemSkeleton() {
  return (
    <article className={`p-5 sm:p-6 ${cardElevated}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded-md" />
          <div
            className={`flex items-center gap-3 rounded-xl bg-zinc-950/40 p-3 ring-1 ring-inset ring-white/[0.05]`}
          >
            <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-1/2 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
      </div>
    </article>
  );
}
