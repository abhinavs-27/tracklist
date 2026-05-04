import { Skeleton } from "@/components/ui/skeleton";

/** Matches real artist header: image left, name/genres/followers right. */
export function ArtistHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
      <Skeleton className="h-48 w-48 shrink-0 rounded-2xl sm:h-56 sm:w-56" />
      <div className="min-w-0 space-y-3">
        <Skeleton className="h-9 w-64 sm:h-10" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-4 pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}
