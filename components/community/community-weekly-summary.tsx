import type { WeeklySummaryPayload } from "@/lib/community/get-community-weekly-summary";

export function CommunityWeeklySummary(props: {
  current: WeeklySummaryPayload | null;
  previous: WeeklySummaryPayload | null;
  trend: { genres: { gained: string[]; lost: string[] } } | null;
}) {
  const { current, trend } = props;
  if (!current) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h3 className="text-sm font-semibold text-white">This week&apos;s vibe</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Run the weekly community job to see genres, listening styles, and activity
          patterns.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-semibold text-white">This week&apos;s vibe</h3>
      <p className="mt-1 text-xs text-zinc-500">Week of {current.week_start} (UTC)</p>

      {current.top_genres.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top genres
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {current.top_genres.slice(0, 8).map((g) => (
              <li
                key={g.name}
                className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-200"
              >
                {g.name}
                <span className="ml-1 text-zinc-500">({g.weight})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {current.top_styles.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Listening styles (members)
          </p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {current.top_styles.slice(0, 5).map((s) => (
              <li key={s.style} className="flex justify-between gap-2">
                <span className="capitalize">{s.style.replace(/-/g, " ")}</span>
                <span className="tabular-nums text-zinc-500">
                  {Math.round(s.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Object.keys(current.activity_pattern).length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Activity (UTC hours)
          </p>
          <div className="mt-2 flex gap-1">
            {Object.entries(current.activity_pattern).map(([k, v]) => (
              <div
                key={k}
                className="flex-1 rounded bg-zinc-800/80"
                title={`${k}: ${Math.round(v * 100)}%`}
              >
                <div
                  className="min-h-[40px] rounded bg-emerald-600/70"
                  style={{ height: `${Math.max(8, v * 120)}px` }}
                />
                <p className="px-0.5 pt-1 text-center text-[10px] text-zinc-500">
                  {k}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {trend && (trend.genres.gained.length > 0 || trend.genres.lost.length > 0) ? (
        <div className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span className="text-zinc-500">vs last week: </span>
          {trend.genres.gained.length > 0 ? (
            <span className="text-emerald-400">
              + {trend.genres.gained.join(", ")}
            </span>
          ) : null}
          {trend.genres.gained.length > 0 && trend.genres.lost.length > 0
            ? " · "
            : null}
          {trend.genres.lost.length > 0 ? (
            <span className="text-rose-400/90">
              − {trend.genres.lost.join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
