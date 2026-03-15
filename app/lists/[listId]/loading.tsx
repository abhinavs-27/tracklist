import { SkeletonBlock, SkeletonCard } from "@/components/ui/skeleton";

export default function ListDetailLoading() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <SkeletonBlock className="h-9 w-64" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
        <SkeletonBlock className="h-4 w-24" />
      </header>

      <div className="space-y-4">
        <SkeletonBlock className="h-6 w-28" />
        <ul className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <SkeletonBlock className="h-12 w-12 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-1">
                <SkeletonBlock className="h-4 w-2/3" />
                <SkeletonBlock className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
