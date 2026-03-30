import { cardElevated } from "@/lib/ui/surface";

export function ProfileBelowFoldSkeleton() {
  return (
    <div className="space-y-8 sm:space-y-10" aria-busy aria-label="Loading profile">
      <div className={`${cardElevated} h-40 animate-pulse bg-zinc-900/60 sm:h-44`} />
      <div className={`${cardElevated} h-48 animate-pulse bg-zinc-900/60`} />
      <div className={`${cardElevated} h-64 animate-pulse bg-zinc-900/60`} />
      <div className={`${cardElevated} h-56 animate-pulse bg-zinc-900/60`} />
    </div>
  );
}
