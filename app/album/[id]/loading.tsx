import { ScrollToTop } from "./scroll-to-top";
import { AlbumHeaderSkeleton } from "@/components/skeletons/album-header-skeleton";
import { TrackRowSkeleton } from "@/components/skeletons/track-row-skeleton";
import { AlbumCardSkeleton } from "@/components/skeletons/album-card-skeleton";
import { ReviewCardSkeleton } from "@/components/skeletons/review-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlbumIdLoading() {
  return (
    <>
      <ScrollToTop />
      <div className="space-y-8">
        <AlbumHeaderSkeleton />

        <section className="mt-8">
          <Skeleton className="mb-3 h-6 w-20" />
          <div className="space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <TrackRowSkeleton key={i} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <Skeleton className="mb-2 h-6 w-44" />
          <Skeleton className="mb-3 h-4 w-56" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <AlbumCardSkeleton key={i} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <Skeleton className="mb-3 h-6 w-24" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReviewCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
