import Link from "next/link";
import type { TasteMatchPeer } from "@/lib/community/get-community-taste-matches";

function pct(n: number) {
  return Math.round(n * 100);
}

function TasteNeighborsBody({
  similar,
  opposite,
}: {
  similar: TasteMatchPeer[];
  opposite: TasteMatchPeer[];
}) {
  const empty = similar.length === 0 && opposite.length === 0;
  if (empty) {
    return (
      <p className="text-sm text-zinc-500">
        Weekly taste pairs appear after the community job runs (needs 2+ members
        with logs).
      </p>
    );
  }
  return (
    <>
      <p className="text-xs text-zinc-500">
        Cosine similarity from last 7 days of listening (updated weekly).
      </p>
      {similar.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-emerald-400/90">Most similar to you</p>
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
    </>
  );
}

/**
 * Taste-neighbor lists for embedding inside the members section (server-rendered).
 */
export function CommunityTasteNeighborsPanel(props: {
  similar: TasteMatchPeer[];
  opposite: TasteMatchPeer[];
}) {
  const { similar, opposite } = props;
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/25 p-4">
      <h3 className="text-sm font-semibold text-white">Taste neighbors</h3>
      <div className="mt-2">
        <TasteNeighborsBody similar={similar} opposite={opposite} />
      </div>
    </div>
  );
}

/** Standalone card (e.g. other pages). */
export function CommunityTastePeers(props: {
  similar: TasteMatchPeer[];
  opposite: TasteMatchPeer[];
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-white">Taste neighbors</h3>
      <div className="mt-2">
        <TasteNeighborsBody similar={props.similar} opposite={props.opposite} />
      </div>
    </section>
  );
}
