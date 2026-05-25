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
    <section>
      <h2 className="text-lg font-semibold text-white">Similar users</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Based on your last 30 days of listens (artist vectors + cosine similarity).
      </p>
      <ul className="mt-4 flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {top.map((m) => {
          const u = userMap.get(m.userId);
          const pct = Math.round(m.similarityScore * 100);
          return (
            <li key={m.userId} className="w-[76px] shrink-0">
              <Link href={`/profile/${m.userId}`} className="group flex flex-col items-center gap-1.5 text-center">
                {u?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt="" className="h-[72px] w-[72px] rounded-full object-cover border border-zinc-700 transition group-hover:border-gold-500/50" />
                ) : (
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-zinc-800 text-xl font-semibold text-zinc-300 border border-zinc-700">
                    {(u?.username ?? "?")[0]?.toUpperCase()}
                  </span>
                )}
                <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-zinc-200 group-hover:text-gold-400">
                  {u?.username ?? "Unknown"}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-gold-400">{pct}%</span>
                <span className="text-[10px] text-zinc-500 leading-tight">{tasteSimilarityLabel(m.similarityScore)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
