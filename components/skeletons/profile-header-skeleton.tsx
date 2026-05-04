import { Skeleton } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

/** Matches Profile page hero banner and header area. */
export function ProfileHeaderSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero Banner Skeleton */}
      <div className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.07]">
        <div className="h-32 sm:h-40 bg-zinc-800/40 animate-pulse" />
        <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-10 flex items-end justify-between sm:-mt-12">
            <Skeleton className="h-20 w-20 rounded-full ring-4 ring-zinc-900 sm:h-24 sm:w-24" />
            <div className="pb-1">
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-48 sm:h-9" />
            <div className="flex gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
          {/* Stats row */}
          <div className="mt-3 flex gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      </div>

      {/* Quick Actions Skeleton */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
