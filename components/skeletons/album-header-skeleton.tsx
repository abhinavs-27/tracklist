import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/lib/ui/surface";

/** Matches real album header layout: cover left (top on mobile), title/artist/stats right. */
export function AlbumHeaderSkeleton() {
  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-end sm:gap-10">
      <div className="flex justify-center sm:justify-start">
        <Skeleton className="h-44 w-44 shrink-0 rounded-2xl sm:h-[200px] sm:w-[200px]" />
      </div>
      <div className="min-w-0 w-full flex-1 space-y-3 text-left">
        <Skeleton className={`h-9 w-3/4 max-w-md ${pageTitle}`} />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-40" />

        {/* Stats bar area */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-800/50 pt-4 text-sm">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
