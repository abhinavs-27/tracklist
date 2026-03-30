import Link from "next/link";
import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { UserTasteMatch } from "@/lib/taste/getUserMatches";
import { getUserMatches } from "@/lib/taste/getUserMatches";
import { tasteSimilarityLabel } from "@/lib/taste/tasteLabels";

export async function SimilarUsersSection({
  userId,
  variant = "list",
  /** When set (e.g. prefetched on the profile page), skips duplicate getUserMatches. */
  prefetchedMatches,
}: {
  userId: string;
  variant?: "list" | "strip";
  prefetchedMatches?: UserTasteMatch[];
}) {
  const matches =
    prefetchedMatches !== undefined
      ? prefetchedMatches
      : await getUserMatches(userId);
  const top = matches.slice(0, variant === "strip" ? 8 : 5);

  if (top.length === 0) {
    return (
      <section className="min-w-0 max-w-full rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">Similar users</h2>
        <p className="mt-2 text-sm text-zinc-500">
          No close matches yet — keep logging music in the last 30 days so we can
          find listeners with a similar artist mix.
        </p>
      </section>
    );
  }

  const admin = createSupabaseAdminClient();
  const userMap = await fetchUserMap(admin, top.map((m) => m.userId));

  const listClass =
    variant === "strip"
      ? "mt-4 flex min-w-0 gap-2 overflow-x-auto pb-2 pl-0.5 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3"
      : "mt-4 space-y-3";

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">Similar users</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Based on your last 30 days of listens (artist vectors + cosine similarity).
      </p>
      <ul className={listClass}>
        {top.map((m) => {
          const u = userMap.get(m.userId);
          const pct = Math.round(m.similarityScore * 100);
          return (
            <li
              key={m.userId}
              className={
                variant === "strip"
                  ? "w-60 max-w-[min(16rem,calc(100vw-2.5rem))] shrink-0 snap-start"
                  : ""
              }
            >
              <Link
                href={`/profile/${m.userId}`}
                className="flex h-full min-w-0 items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-2 transition hover:border-zinc-600 sm:gap-3 sm:px-3"
              >
                {u?.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-10 sm:w-10"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-300 sm:h-10 sm:w-10">
                    {(u?.username ?? "?")[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {u?.username ?? "Unknown"}
                  </p>
                  <p className="truncate text-xs text-zinc-500 sm:hidden">
                    {tasteSimilarityLabel(m.similarityScore)}
                  </p>
                  <p className="hidden truncate text-xs text-zinc-500 sm:block">
                    {pct}% · {tasteSimilarityLabel(m.similarityScore)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-400">
                  {pct}%
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
