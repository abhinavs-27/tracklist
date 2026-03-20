import { Skeleton } from "@/components/ui/skeleton";

/** Matches real album header layout: cover left (top on mobile), title/artist/stats right. */
export function AlbumHeaderSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr] sm:items-start">
      <div className="flex justify-center sm:justify-start">
        <Skeleton className="h-44 w-44 shrink-0 rounded-xl sm:h-[200px] sm:w-[200px]" />
      </div>
      <div className="min-w-0 w-full flex-1 space-y-2 text-left">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40 mt-2" />
        <Skeleton className="h-4 w-16 mt-2" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg mt-4" />
      </div>
    </div>
  );
}
