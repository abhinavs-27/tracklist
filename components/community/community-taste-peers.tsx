import Link from "next/link";
import type { TasteMatchPeer } from "@/lib/community/get-community-taste-matches";

export function CommunityTastePeers(props: {
  similar: TasteMatchPeer[];
  opposite: TasteMatchPeer[];
}) {
  const { similar, opposite } = props;
  if (similar.length === 0 && opposite.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-sm font-semibold text-white">Taste neighbors</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Weekly taste pairs appear after the community job runs (needs 2+ members
          with logs).
        </p>
      </section>
    );
  }

  function pct(n: number) {
    return Math.round(n * 100);
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-white">Taste neighbors</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Cosine similarity from last 7 days of listening (updated weekly).
      </p>

      {similar.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-emerald-400/90">Most similar</p>
          <ul className="mt-2 space-y-2">
            {similar.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/profile/${p.userId}`}
                  className="font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {p.username}
                </Link>
                <span className="tabular-nums text-zinc-400">{pct(p.similarity_score)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {opposite.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-amber-400/90">Different taste</p>
          <ul className="mt-2 space-y-2">
            {opposite.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/profile/${p.userId}`}
                  className="font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {p.username}
                </Link>
                <span className="tabular-nums text-zinc-400">{pct(p.similarity_score)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
