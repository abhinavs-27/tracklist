import Link from "next/link";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";
import {
  communityBody,
  communityCard,
  communityHeadline,
  communityInset,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

type Props = {
  insights: CommunityInsightsData;
  /** When true, hides the "Top artists" block (e.g. when discovery carousels show the same). */
  hideTopArtists?: boolean;
  /** When true, omits outer card and "Group insights" heading (use inside a collapsible). */
  embedded?: boolean;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function CommunityInsights({
  insights,
  hideTopArtists = false,
  embedded = false,
}: Props) {
  const {
    summary,
    topArtists,
    explorationScore,
    explorationLabel,
    timeOfDay,
    dominantTime,
    diversityScore,
    diversityLabel,
  } = insights;

  const totalTime =
    timeOfDay.morning +
    timeOfDay.afternoon +
    timeOfDay.night +
    timeOfDay.lateNight;

  const bar = (count: number) =>
    totalTime === 0 ? 0 : Math.round((count / totalTime) * 100);

  const shellClass = embedded ? "space-y-6" : `space-y-6 ${communityCard}`;
  const Shell = embedded ? "div" : "section";

  return (
    <Shell className={shellClass}>
      {!embedded ? (
        <div>
          <h3 className={communityHeadline}>Group insights</h3>
          <p className={`mt-2 ${communityMeta}`}>
            Based on everyone&apos;s listens from the last seven days, by time of day.
          </p>
        </div>
      ) : null}

      <p className={`font-medium text-zinc-100 ${communityBody}`}>{summary}</p>

      {!hideTopArtists ? (
        <div>
          <h3 className={`mb-3 ${communityMetaLabel}`}>Top artists</h3>
          {topArtists.length === 0 ? (
            <p className={`${communityBody} text-zinc-500`}>No artist data for this period yet.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {topArtists.map((a) => (
                <Link
                  key={a.artistId}
                  href={`/artist/${encodeURIComponent(a.artistId)}`}
                  className={`min-w-[140px] shrink-0 px-3 py-2.5 transition hover:bg-zinc-900/50 ${communityInset}`}
                >
                  <p className={`truncate font-medium text-white ${communityBody}`}>{a.name}</p>
                  <p className={communityMeta}>{a.count} listens</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`p-4 ${communityInset}`}>
          <h3 className={communityMetaLabel}>Exploration</h3>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-emerald-400">
            {pct(explorationScore)}
          </p>
          <p className={`mt-1 ${communityBody} text-zinc-400`}>{explorationLabel}</p>
          <p className={`mt-2 ${communityMeta} text-zinc-600`}>
            Unique artists ÷ total listens
          </p>
        </div>

        <div className={`p-4 ${communityInset}`}>
          <h3 className={communityMetaLabel}>Taste overlap</h3>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-amber-400/90">
            {pct(diversityScore)}
          </p>
          <p className={`mt-1 ${communityBody} text-zinc-400`}>{diversityLabel}</p>
          <p className={`mt-2 ${communityMeta} text-zinc-600`}>
            Avg. similarity of each member&apos;s top artists
          </p>
        </div>
      </div>

      <div>
        <h3 className={`mb-2 ${communityMetaLabel}`}>Time pattern</h3>
        <p className={`mb-4 ${communityBody} text-zinc-400`}>
          Strongest: <span className="text-zinc-200">{dominantTime}</span>
        </p>
        {totalTime === 0 ? (
          <p className={`${communityBody} text-zinc-500`}>No timestamps in range.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
              {bar(timeOfDay.morning) > 0 ? (
                <div
                  className="bg-sky-500/90"
                  style={{ width: `${bar(timeOfDay.morning)}%` }}
                  title="Morning"
                />
              ) : null}
              {bar(timeOfDay.afternoon) > 0 ? (
                <div
                  className="bg-amber-500/90"
                  style={{ width: `${bar(timeOfDay.afternoon)}%` }}
                  title="Afternoon"
                />
              ) : null}
              {bar(timeOfDay.night) > 0 ? (
                <div
                  className="bg-violet-500/90"
                  style={{ width: `${bar(timeOfDay.night)}%` }}
                  title="Evening"
                />
              ) : null}
              {bar(timeOfDay.lateNight) > 0 ? (
                <div
                  className="bg-indigo-600/90"
                  style={{ width: `${bar(timeOfDay.lateNight)}%` }}
                  title="Late night"
                />
              ) : null}
            </div>
            <ul className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 ${communityMeta}`}>
              <li>
                <span className="text-sky-400">■</span> Morning 6–12{" "}
                <span className="text-zinc-400">({timeOfDay.morning})</span>
              </li>
              <li>
                <span className="text-amber-400">■</span> Afternoon 12–18{" "}
                <span className="text-zinc-400">({timeOfDay.afternoon})</span>
              </li>
              <li>
                <span className="text-violet-400">■</span> Evening 18–24{" "}
                <span className="text-zinc-400">({timeOfDay.night})</span>
              </li>
              <li>
                <span className="text-indigo-400">■</span> Late night 0–6{" "}
                <span className="text-zinc-400">({timeOfDay.lateNight})</span>
              </li>
            </ul>
          </>
        )}
      </div>
    </Shell>
  );
}
