import { Skeleton } from "@/components/ui/skeleton";

/** Matches FeedItem (listen summary style): avatar, user line, track card block. */
export function FeedItemSkeleton() {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            <Skeleton className="h-12 w-12 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </article>
  );
}
