import { Skeleton } from "@/components/ui/skeleton";
import { cardElevated } from "@/lib/ui/surface";

export function ProfileBelowFoldSkeleton() {
  return (
    <div className="space-y-8 sm:space-y-10" aria-busy aria-label="Loading profile">
      <Skeleton className={`${cardElevated} h-40 bg-zinc-900/60 sm:h-44`} />
      <Skeleton className={`${cardElevated} h-48 bg-zinc-900/60`} />
      <Skeleton className={`${cardElevated} h-64 bg-zinc-900/60`} />
      <Skeleton className={`${cardElevated} h-56 bg-zinc-900/60`} />
    </div>
  );
}
