import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/lib/ui/surface";

/** Matches Song page header: large cover + title/artist/album/stats. */
export function SongHeaderSkeleton() {
  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-end sm:gap-10">
      <Skeleton className="h-44 w-44 shrink-0 rounded-2xl sm:h-56 sm:w-56" />
      <div className="w-full min-w-0 flex-1 space-y-3">
        <Skeleton className={`h-9 w-3/4 max-w-md ${pageTitle}`} />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-16" />

        {/* Stats bar area */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-800/50 pt-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
