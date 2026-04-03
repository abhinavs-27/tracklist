import { SkeletonAvatar, SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";
import {
  layoutMainColumn,
  layoutMainSidebarGrid,
  layoutSidebarColumn,
} from "@/lib/ui/layout";
import { cardElevated } from "@/lib/ui/surface";

export default function ProfileLoading() {
  return (
    <div className="space-y-10 sm:space-y-12">
      <div className={`p-6 sm:p-8 ${cardElevated} bg-gradient-to-br from-zinc-900/95 to-emerald-950/20`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <SkeletonAvatar size={112} />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <SkeletonBlock className="h-8 w-48" />
              <SkeletonBlock className="h-4 w-full max-w-sm" />
              <SkeletonBlock className="h-4 w-2/3 max-w-md" />
              <div className="flex gap-4 pt-2">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-4 w-24" />
              </div>
            </div>
          </div>
          <SkeletonBlock className="h-10 w-28 shrink-0 rounded-xl" />
        </div>
      </div>

      <div className={layoutMainSidebarGrid}>
        <div className={`${layoutMainColumn} p-5 ${cardElevated}`}>
          <SkeletonBlock className="mb-3 h-6 w-32" />
          <SkeletonBlock className="h-24 w-full rounded-xl" />
        </div>
        <div className={`${layoutSidebarColumn} p-5 ${cardElevated}`}>
          <SkeletonBlock className="mb-3 h-6 w-36" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-20 w-40 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <SkeletonBlock className="h-7 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={100} lines={1} />
          ))}
        </div>
      </section>
    </div>
  );
}
