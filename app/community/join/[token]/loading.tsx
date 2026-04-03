import { contentMax2xl } from "@/lib/ui/layout";
import { SkeletonBlock } from "@/components/ui/skeleton";

/** Matches invite join layout so navigation doesn’t flash the global feed skeleton. */
export default function CommunityInviteLoading() {
  return (
    <div className="min-h-[70vh] bg-zinc-950 py-12">
      <div className={`${contentMax2xl} space-y-8`}>
        <header className="text-center">
          <SkeletonBlock className="mx-auto h-3 w-32 rounded-full" />
          <SkeletonBlock className="mx-auto mt-4 h-9 w-3/4 max-w-md rounded-lg" />
          <SkeletonBlock className="mx-auto mt-4 h-4 w-full max-w-lg" />
          <SkeletonBlock className="mx-auto mt-3 h-3 w-40 rounded-full" />
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <SkeletonBlock className="h-4 w-36" />
          <ul className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <SkeletonBlock className="h-12 w-12 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-4 w-4/5 max-w-xs" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <SkeletonBlock className="h-4 w-28" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-4 w-full max-w-md" />
            ))}
          </div>
        </section>

        <div className="mx-auto flex max-w-md flex-col gap-3">
          <SkeletonBlock className="h-4 w-full rounded-lg" />
          <SkeletonBlock className="h-4 w-full rounded-lg" />
          <SkeletonBlock className="mx-auto mt-2 h-12 w-full max-w-sm rounded-xl" />
        </div>
      </div>
    </div>
  );
}
