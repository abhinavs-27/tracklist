import { Skeleton } from "@/components/ui/skeleton";

/** Matches real artist header: image left, name/genres/followers right. */
export function ArtistHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
      <Skeleton className="h-48 w-48 shrink-0 rounded-xl sm:h-56 sm:w-56" />
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-36 mt-2" />
        <Skeleton className="h-4 w-44 mt-2" />
      </div>
    </div>
  );
}
