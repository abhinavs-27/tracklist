import Link from "next/link";
import type { RecommendedCommunity } from "@/lib/community/getRecommendedCommunities";

export function RecommendedCommunitiesSection({
  items,
  title = "Recommended for you",
  showBrowseAll = true,
}: {
  items: RecommendedCommunity[];
  title?: string;
  showBrowseAll?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-semibold text-white sm:text-lg">
          {title}
        </h2>
        {showBrowseAll ? (
          <Link
            href="/communities"
            className="text-sm text-emerald-400 hover:underline"
          >
            All communities →
          </Link>
        ) : null}
      </div>
      <p className="mb-3 text-sm text-zinc-500">
        Public groups matched to your last 30 days of listening.
      </p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:px-0">
        {items.map((c) => {
          const pct = Math.round(c.score * 100);
          return (
            <Link
              key={c.communityId}
              href={`/communities/${c.communityId}`}
              className="min-w-[220px] max-w-[260px] shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-600 hover:bg-zinc-900/80"
            >
              <p className="line-clamp-2 font-medium text-white">{c.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {c.isFallback ? (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                    {c.label}
                    {c.memberCount > 0 ? ` · ${c.memberCount} members` : ""}
                  </span>
                ) : (
                  <>
                    <span className="font-semibold tabular-nums text-emerald-400">
                      {pct}%
                    </span>
                    <span className="text-zinc-500">{c.label}</span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
