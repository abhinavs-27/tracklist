import { ArtistHeaderSkeleton } from "@/components/skeletons/artist-header-skeleton";
import { AlbumCardSkeleton } from "@/components/skeletons/album-card-skeleton";
import { TrackRowSkeleton } from "@/components/skeletons/track-row-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArtistLoading() {
  return (
    <div className="space-y-8">
      <ArtistHeaderSkeleton />

      <section>
        <Skeleton className="mb-3 h-6 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <TrackRowSkeleton key={i} />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-6 w-28" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-6 w-32" />
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Skeleton className="mb-3 h-6 w-28" />
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
