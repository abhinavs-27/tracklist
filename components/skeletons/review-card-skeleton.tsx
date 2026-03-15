import { Skeleton } from "@/components/ui/skeleton";

/** Matches ReviewCard layout: avatar, username, review text lines. */
export function ReviewCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
