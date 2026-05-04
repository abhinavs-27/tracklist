import { ArtistHeaderSkeleton } from "@/components/skeletons/artist-header-skeleton";
import { TrackRowSkeleton } from "@/components/skeletons/track-row-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { sectionGap } from "@/lib/ui/surface";

export default function ArtistLoading() {
  return (
    <div className={sectionGap}>
      <ArtistHeaderSkeleton />

      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-24" />
      </div>

      <section className="space-y-4">
        <Skeleton className="h-7 w-40" />
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <TrackRowSkeleton key={i} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
