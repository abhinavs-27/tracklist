import { AlbumHeaderSkeleton } from "@/components/skeletons/album-header-skeleton";
import { TrackRowSkeleton } from "@/components/skeletons/track-row-skeleton";
import { sectionGap } from "@/lib/ui/surface";
import { ScrollToTop } from "./scroll-to-top";

export default function AlbumIdLoading() {
  return (
    <div className={sectionGap}>
      <ScrollToTop />
      <AlbumHeaderSkeleton />
      <div className="mt-8 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <TrackRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
