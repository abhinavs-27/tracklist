import { SkeletonBlock } from "@/components/ui/skeleton";

/** Shown while a saved report loads (`/reports/shared/[id]`). */
export default function SharedListeningReportLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <SkeletonBlock className="h-4 w-40 rounded" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-9 w-full max-w-md rounded-lg" />
          <SkeletonBlock className="h-4 w-72 max-w-full rounded" />
        </div>
        <SkeletonBlock className="h-11 w-28 shrink-0 rounded-full" />
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-3 w-32 rounded" />
            <SkeletonBlock className="h-3 w-full max-w-lg rounded" />
          </div>
          <SkeletonBlock className="h-9 w-24 shrink-0 rounded-lg" />
        </div>
      </div>

      <SkeletonBlock className="h-4 w-56 rounded" />

      <ol className="space-y-2" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
          >
            <SkeletonBlock className="h-4 w-6 shrink-0 rounded" />
            <SkeletonBlock className="h-12 w-12 shrink-0 rounded object-cover" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 max-w-[12rem] rounded" />
              <SkeletonBlock className="h-3 w-16 rounded" />
            </div>
            <SkeletonBlock className="h-4 w-8 shrink-0 rounded" />
          </li>
        ))}
      </ol>
    </div>
  );
}
