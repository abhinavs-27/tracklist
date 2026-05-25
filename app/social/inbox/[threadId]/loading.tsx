import { SocialInboxListSkeleton } from "@/components/social/inbox-skeletons";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { contentMax2xl } from "@/lib/ui/layout";
import { sectionGap } from "@/lib/ui/surface";

/** Shell for a single conversation thread. Matches `InboxRowSkeleton` visual density but expanded. */
export default function SocialThreadLoading() {
  return (
    <div className={`${contentMax2xl} py-8 ${sectionGap} animate-pulse`}>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <SkeletonBlock className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-8 w-64 max-w-full" />
        </div>
      </header>

      <div className="mt-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-2xl p-4 ${
              i % 2 === 0 ? "ml-auto bg-gold-950/20" : "bg-zinc-900/40"
            }`}
          >
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-2/3" />
            <SkeletonBlock className="mt-3 h-3 w-16 opacity-50" />
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-zinc-900/50 p-4 ring-1 ring-white/[0.05]">
        <SkeletonBlock className="h-10 w-full" />
      </div>
    </div>
  );
}
