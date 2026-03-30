import { SkeletonBlock } from "@/components/ui/skeleton";
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
    <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-10 w-52 rounded-lg sm:h-11" />
          <SkeletonBlock className="h-4 w-full max-w-lg rounded-md" />
          <SkeletonBlock className="h-4 w-full max-w-xl rounded-md" />
          <div className="flex flex-wrap gap-1 rounded-2xl bg-zinc-900/65 p-1 ring-1 ring-inset ring-white/[0.07]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock
                key={i}
                className="h-9 w-[6.5rem] rounded-xl"
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
        {Array.from({ length: 5 }).map((_, i) => (
          <InboxRowSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

/** Matches `/social/inbox/[threadId]` while the page streams. */
export function SocialThreadDetailSkeleton() {
  return (
    <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${sectionGap}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SkeletonBlock className="h-9 w-36 rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-10 w-28 rounded-lg" />
          <SkeletonBlock className="h-10 w-16 rounded-lg" />
        </div>
      </header>

      <div
        className="overflow-hidden rounded-2xl bg-zinc-900/50 p-0 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]"
        aria-hidden
      >
        <div className="space-y-3 border-b border-white/[0.06] px-5 py-5 sm:px-6">
          <SkeletonBlock className="h-6 w-36 rounded-lg" />
          <SkeletonBlock className="h-4 w-full max-w-lg rounded-md" />
        </div>
        <div className="flex flex-col gap-6 border-b border-white/[0.06] px-5 py-8 sm:flex-row sm:items-center sm:px-6">
          <SkeletonBlock className="mx-auto h-36 w-36 shrink-0 rounded-2xl sm:mx-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <SkeletonBlock className="h-8 w-full max-w-xs rounded-lg" />
            <SkeletonBlock className="h-4 w-48 rounded-md" />
            <SkeletonBlock className="h-10 w-40 rounded-xl" />
          </div>
        </div>
        <div className="border-b border-white/[0.06] px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-10 w-11 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="bg-zinc-950/35 px-5 py-6 sm:px-6">
          <SkeletonBlock className="h-3 w-16 rounded-md" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-zinc-950/40 p-4 ring-1 ring-white/[0.05]">
                <div className="flex gap-2">
                  <SkeletonBlock className="h-4 w-20 rounded-md" />
                  <SkeletonBlock className="h-3 w-14 rounded-md" />
                </div>
                <SkeletonBlock className="mt-2 h-4 w-full rounded-md" />
                <SkeletonBlock className="mt-1 h-4 w-[85%] rounded-md" />
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-white/[0.06] pt-5">
            <SkeletonBlock className="h-20 w-full rounded-xl" />
            <div className="mt-3 flex justify-between">
              <SkeletonBlock className="h-4 w-16 rounded-md" />
              <SkeletonBlock className="h-10 w-28 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
