import {
  communityMatchShortLabel,
  tasteSimilarityLabel,
} from "@/lib/taste/tasteLabels";

export function CommunityTasteMatchCard({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-emerald-950/40 to-zinc-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Your match
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-white">{pct}%</span>
        <span className="text-sm font-medium text-emerald-400">
          {communityMatchShortLabel(score)}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{tasteSimilarityLabel(score)}</p>
      <p className="mt-2 text-xs text-zinc-600">
        How your last 30 days of listens align with this group&apos;s combined
        listening.
      </p>
    </div>
  );
}
