import Link from "next/link";
import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserMatches } from "@/lib/taste/getUserMatches";
import { tasteSimilarityLabel } from "@/lib/taste/tasteLabels";

export async function SimilarUsersSection({
  userId,
  variant = "list",
}: {
  userId: string;
  variant?: "list" | "strip";
}) {
  const matches = await getUserMatches(userId);
  const top = matches.slice(0, variant === "strip" ? 8 : 5);

  if (top.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
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
      ? "mt-4 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      : "mt-4 space-y-3";

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
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
              className={variant === "strip" ? "w-[min(100%,260px)] shrink-0" : ""}
            >
              <Link
                href={`/profile/${m.userId}`}
                className="flex h-full items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 transition hover:border-zinc-600"
              >
                {u?.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm text-zinc-300">
                    {(u?.username ?? "?")[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {u?.username ?? "Unknown"}
                  </p>
                  <p className="text-xs text-zinc-500">
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
