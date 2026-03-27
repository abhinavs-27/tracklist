import { SkeletonBlock } from "@/components/ui/skeleton";

export default function ListeningReportsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <SkeletonBlock className="h-4 w-16 rounded" />

      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <SkeletonBlock className="h-9 w-56 max-w-full rounded-lg" />
        <SkeletonBlock className="h-4 w-28 rounded" />
      </div>

      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-full max-w-xl rounded" />
        <SkeletonBlock className="h-4 w-full max-w-lg rounded" />
      </div>

      <div className="space-y-8">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock
              key={i}
              className="h-9 w-24 rounded-full"
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock
              key={i}
              className="h-9 w-20 rounded-full"
            />
          ))}
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-start gap-3">
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-32 rounded" />
                <SkeletonBlock className="h-3 w-full max-w-md rounded" />
                <SkeletonBlock className="h-3 w-4/5 max-w-sm rounded" />
              </div>
            </div>
            <SkeletonBlock className="mx-auto h-8 w-11 shrink-0 rounded-full sm:mx-0" />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-4 sm:flex-row sm:justify-end sm:gap-2">
            <SkeletonBlock className="h-11 w-full rounded-lg sm:w-36" />
            <SkeletonBlock className="h-11 w-full rounded-lg sm:w-36" />
          </div>
        </div>

        <SkeletonBlock className="h-4 w-48 rounded" />

        <ol className="space-y-2" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
            >
              <SkeletonBlock className="h-4 w-6 shrink-0 rounded" />
              <SkeletonBlock className="h-12 w-12 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-3/5 max-w-[14rem] rounded" />
                <SkeletonBlock className="h-3 w-20 rounded" />
              </div>
              <SkeletonBlock className="h-4 w-8 shrink-0 rounded" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
