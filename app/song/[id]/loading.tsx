import { SongHeaderSkeleton } from "@/components/skeletons/song-header-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { sectionGap } from "@/lib/ui/surface";

export default function SongIdLoading() {
  return (
    <div className={sectionGap}>
      <SongHeaderSkeleton />

      {/* Reviews section placeholder */}
      <section className="mt-12 space-y-6">
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
