import { SkeletonBlock } from "@/components/ui/skeleton";

export function CommunityListRowSkeleton() {
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-48 max-w-[70%]" />
          <SkeletonBlock className="h-4 w-full max-w-xs" />
        </div>
        <div className="shrink-0 space-y-2 text-right">
          <SkeletonBlock className="ml-auto h-3 w-16" />
          <SkeletonBlock className="ml-auto h-4 w-14" />
        </div>
      </div>
    </li>
  );
}
