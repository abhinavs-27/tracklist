import { SkeletonBlock } from "@/components/ui/skeleton";
import { contentMax2xl } from "@/lib/ui/layout";
import { cardElevatedInteractive, sectionGap } from "@/lib/ui/surface";

function InboxRowSkeleton() {
  return (
    <li>
      <div
        className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:justify-between sm:p-5 ${cardElevatedInteractive} border-l-4 border-zinc-700/40`}
      >
        <div className="flex min-w-0 flex-1 gap-4">
          <SkeletonBlock className="h-16 w-16 shrink-0 rounded-2xl sm:h-[4.5rem] sm:w-[4.5rem]" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-28 rounded-lg" />
            <SkeletonBlock className="h-5 w-full max-w-sm rounded-md" />
            <SkeletonBlock className="h-3 w-40 rounded-md" />
            <SkeletonBlock className="h-4 w-full max-w-md rounded-md" />
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-t border-white/[0.04] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
          <SkeletonBlock className="h-3 w-14 rounded-md" />
          <SkeletonBlock className="h-7 w-16 rounded-full" />
        </div>
      </div>
    </li>
  );
}

/** Matches `/social/inbox` layout while the page streams. */
export function SocialInboxListSkeleton() {
  return (
    <div className={`${contentMax2xl} py-8 ${sectionGap}`}>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-10 w-52 rounded-lg sm:h-11" />
          <SkeletonBlock className="h-4 w-full max-w-lg rounded-md" />
          <SkeletonBlock className="h-4 w-full max-w-xl rounded-md" />
          <div className="flex flex-wrap gap-1 rounded-2xl bg-zinc-900/65 p-1 ring-1 ring-inset ring-white/[0.07]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock
                key={i}
                className={`h-9 w-[6.5rem] rounded-xl ${i >= 3 ? "max-sm:hidden" : ""}`}
              />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <SkeletonBlock className="h-10 w-28 rounded-lg" />
          <SkeletonBlock className="h-10 w-16 rounded-lg" />
        </div>
      </header>

      <ul className="m-0 list-none space-y-3 p-0" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <InboxRowSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}
