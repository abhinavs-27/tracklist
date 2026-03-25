import Link from "next/link";
import type { CommunityInsights as CommunityInsightsData } from "@/lib/community/getCommunityInsights";

type Props = {
  insights: CommunityInsightsData;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function CommunityInsights({ insights }: Props) {
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

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Group insights</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Based on all members&apos; listens from the last 7 days (UTC time-of-day).
        </p>
      </div>

      <p className="text-lg font-medium leading-relaxed text-zinc-100">
        {summary}
      </p>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Top artists
        </h3>
        {topArtists.length === 0 ? (
          <p className="text-sm text-zinc-500">No artist data in this window yet.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {topArtists.map((a) => (
              <Link
                key={a.artistId}
                href={`/artist/${encodeURIComponent(a.artistId)}`}
                className="min-w-[140px] shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 transition hover:border-zinc-600"
              >
                <p className="truncate text-sm font-medium text-white">{a.name}</p>
                <p className="text-xs text-zinc-500">{a.count} listens</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Exploration
          </h3>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {pct(explorationScore)}
          </p>
          <p className="text-sm text-zinc-400">{explorationLabel}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Unique artists ÷ total listens
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Taste overlap
          </h3>
          <p className="mt-2 text-2xl font-bold text-amber-400/90">
            {pct(diversityScore)}
          </p>
          <p className="text-sm text-zinc-400">{diversityLabel}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Avg. similarity of each member&apos;s top artists
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Time pattern
        </h3>
        <p className="mb-3 text-sm text-zinc-400">
          Strongest: <span className="text-zinc-200">{dominantTime}</span>
        </p>
        {totalTime === 0 ? (
          <p className="text-sm text-zinc-500">No timestamps in range.</p>
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
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
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
    </section>
  );
}
