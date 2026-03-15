import { Skeleton } from "@/components/ui/skeleton";

/** Matches real album card layout: aspect-square image + title/subtitle. */
export function AlbumCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
