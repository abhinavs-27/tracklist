import { contentMax2xl } from "@/lib/ui/layout";
import { SkeletonBlock } from "@/components/ui/skeleton";

export default function CommunityInvitesLoading() {
  return (
    <div className={`${contentMax2xl} space-y-6 py-8`}>
      <SkeletonBlock className="h-4 w-28" />
      <div className="space-y-2">
        <SkeletonBlock className="h-9 w-64" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-48" />
              <SkeletonBlock className="h-4 w-64 max-w-full" />
            </div>
            <div className="flex shrink-0 gap-2">
              <SkeletonBlock className="h-9 w-24 rounded-lg" />
              <SkeletonBlock className="h-9 w-24 rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
