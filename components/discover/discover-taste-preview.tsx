import Link from "next/link";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { TasteCard } from "@/components/taste-card";

/** Compact taste snapshot for signed-in Discover (uses cached identity). */
export async function DiscoverTastePreview({ userId }: { userId: string }) {
  const t = await getTasteIdentity(userId);
  if (t.totalLogs === 0) return null;

  const insight = t.recent?.insightWeek?.trim() ? t.recent.insightWeek : t.summary;
  const genres =
    t.recent?.topGenres7d && t.recent.topGenres7d.length > 0
      ? t.recent.topGenres7d
      : t.topGenres;
  const insightSource = t.recent?.insightWeek?.trim()
    ? "Last 7 days vs last 30 days"
    : "All-time listening";
  const genresLabel = t.recent?.topGenres7d?.length ? "This week" : "Top genres";

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Your taste
        </h2>
        <Link
          href={`/profile/${userId}`}
          className="text-xs text-emerald-400 hover:underline"
        >
          Profile →
        </Link>
      </div>
      <TasteCard
        mode="identity"
        title="Snapshot"
        subtitle={t.totalLogs > 0 ? `From ${t.totalLogs} logs` : undefined}
        insight={insight}
        genres={genres}
        insightSource={insightSource}
        genresLabel={genresLabel}
        density="compact"
      />
    </section>
  );
}
