import { AlbumCardSkeleton } from "@/components/skeletons/album-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Next.js `loading.tsx` must be the default export. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={i >= 6 ? "max-md:hidden" : undefined}>
            <AlbumCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlbumsLoading() {
  return <Loading />;
}
