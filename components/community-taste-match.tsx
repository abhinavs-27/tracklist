import {
  communityMatchShortLabel,
  tasteSimilarityLabel,
} from "@/lib/taste/tasteLabels";
import {
  communityCard,
  communityBody,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

export function CommunityTasteMatchCard({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div
      className={`${communityCard} bg-gradient-to-br from-emerald-950/35 to-zinc-950/50`}
    >
      <p className={communityMetaLabel}>Your match</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
          {pct}%
        </span>
        <span className={`font-medium text-emerald-400 ${communityBody}`}>
          {communityMatchShortLabel(score)}
        </span>
      </div>
      <p className={`mt-2 ${communityBody} text-zinc-400`}>
        {tasteSimilarityLabel(score)}
      </p>
      <p className={`mt-3 ${communityMeta} text-zinc-600`}>
        How your last 30 days of listens align with this group&apos;s combined
        listening.
      </p>
    </div>
  );
}
