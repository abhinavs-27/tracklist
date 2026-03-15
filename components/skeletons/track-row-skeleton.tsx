import { Skeleton } from "@/components/ui/skeleton";

/** Matches real album page track row: number, track name/artist, duration; optional stats sub-row. */
export function TrackRowSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-full max-w-[200px]" />
        </div>
        <Skeleton className="h-4 w-12 shrink-0 hidden sm:block" />
      </div>
      <div className="flex items-center gap-3 pl-9">
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}
