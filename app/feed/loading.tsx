import { SkeletonAvatar, SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";

function FeedItemSkeleton() {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={36} />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-32" />
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            <SkeletonBlock className="h-12 w-12 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
          </div>
          <SkeletonBlock className="h-3 w-20" />
        </div>
      </div>
    </article>
  );
}

export default function FeedLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-9 w-24" />
      <ul className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <FeedItemSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
