import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import {
  communityBody,
  communityCard,
  communityHeadline,
  communityInset,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

type Props = {
  insights: CommunityInsightsData;
};

/** Narrow “at a glance” insights for desktop sidebar (no artist carousel). */
export function CommunityInsightsCompact({ insights }: Props) {
  const {
    summary,
    explorationScore,
    explorationLabel,
    diversityScore,
    diversityLabel,
    timeOfDay,
    dominantTime,
  } = insights;

  const totalTime =
    timeOfDay.morning +
    timeOfDay.afternoon +
    timeOfDay.night +
    timeOfDay.lateNight;

  const bar = (count: number) =>
    totalTime === 0 ? 0 : Math.round((count / totalTime) * 100);

  return (
    <section className={communityCard}>
      <h3 className={communityHeadline}>Insights</h3>
      <p className={`mt-2 text-sm leading-relaxed text-zinc-300 ${communityBody}`}>
        {summary}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`p-3 ${communityInset}`}>
          <p className={communityMetaLabel}>Exploration</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-emerald-400">
            {pct(explorationScore)}
          </p>
          <p className={`mt-1 text-xs ${communityBody} text-zinc-500`}>
            {explorationLabel}
          </p>
        </div>
        <div className={`p-3 ${communityInset}`}>
          <p className={communityMetaLabel}>Overlap</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-400/90">
            {pct(diversityScore)}
          </p>
          <p className={`mt-1 text-xs ${communityBody} text-zinc-500`}>
            {diversityLabel}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <p className={communityMetaLabel}>Time pattern</p>
        <p className={`mt-1 text-sm ${communityBody} text-zinc-400`}>
          Strongest: <span className="text-zinc-200">{dominantTime}</span>
        </p>
        {totalTime > 0 ? (
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            {bar(timeOfDay.morning) > 0 ? (
              <div
                className="bg-sky-500/90"
                style={{ width: `${bar(timeOfDay.morning)}%` }}
              />
            ) : null}
            {bar(timeOfDay.afternoon) > 0 ? (
              <div
                className="bg-amber-500/90"
                style={{ width: `${bar(timeOfDay.afternoon)}%` }}
              />
            ) : null}
            {bar(timeOfDay.night) > 0 ? (
              <div
                className="bg-violet-500/90"
                style={{ width: `${bar(timeOfDay.night)}%` }}
              />
            ) : null}
            {bar(timeOfDay.lateNight) > 0 ? (
              <div
                className="bg-indigo-600/90"
                style={{ width: `${bar(timeOfDay.lateNight)}%` }}
              />
            ) : null}
          </div>
        ) : (
          <p className={`mt-2 ${communityMeta} text-zinc-600`}>
            No timestamps in range.
          </p>
        )}
      </div>
    </section>
  );
}
