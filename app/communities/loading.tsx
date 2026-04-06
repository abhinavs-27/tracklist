import { CommunityListRowSkeleton } from "@/components/skeletons/community-list-row-skeleton";
import { contentMax2xl } from "@/lib/ui/layout";
import { SkeletonBlock } from "@/components/ui/skeleton";

export default function CommunitiesLoading() {
  return (
    <div className={`${contentMax2xl} space-y-6 py-8`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <SkeletonBlock className="h-9 w-52 max-w-[85%]" />
          <SkeletonBlock className="h-4 w-full max-w-md" />
          <SkeletonBlock className="h-4 w-2/3 max-w-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-10 w-[5.5rem] rounded-lg" />
          <SkeletonBlock className="h-10 w-40 rounded-lg" />
        </div>
      </div>

      <ul className="space-y-2" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <CommunityListRowSkeleton
            key={i}
            className={i >= 4 ? "max-md:hidden" : ""}
          />
        ))}
      </ul>
    </div>
  );
}
