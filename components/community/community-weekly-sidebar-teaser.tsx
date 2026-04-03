import type { CommunityWeeklySummaryBundle } from "@/lib/community/community-page-cache";
import {
  communityBody,
  communityCard,
  communityHeadline,
  communityMeta,
  communityMetaLabel,
} from "@/lib/ui/surface";

type Props = {
  payload: CommunityWeeklySummaryBundle;
};

/** Short weekly snapshot for desktop sidebar (server-rendered from cached bundle). */
export function CommunityWeeklySidebarTeaser({ payload }: Props) {
  const current = payload.current;
  if (!current) {
    return (
      <section className={communityCard}>
        <h3 className={communityHeadline}>This week</h3>
        <p className={`mt-2 ${communityBody} text-zinc-500`}>
          Weekly trends will appear after the community job runs.
        </p>
      </section>
    );
  }

  const topGenres = current.top_genres.slice(0, 3);
  const topStyles = current.top_styles.slice(0, 4);
  const maxG = Math.max(1, ...current.top_genres.map((g) => g.weight));

  return (
    <section className={communityCard}>
      <h3 className={communityHeadline}>This week</h3>
      <p className={`mt-1 ${communityMeta}`}>
        Week of {current.week_start}
      </p>

      {topGenres.length > 0 ? (
        <div className="mt-4">
          <p className={communityMetaLabel}>Top genres</p>
          <ul className="mt-2 space-y-2">
            {topGenres.map((g) => (
              <li key={g.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm font-medium text-zinc-200 ${communityBody}`}>
                    {g.name}
                  </span>
                  <span className={`shrink-0 tabular-nums ${communityMeta}`}>
                    {g.weight}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (g.weight / maxG) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {topStyles.length > 0 ? (
        <div className="mt-4">
          <p className={communityMetaLabel}>Styles</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topStyles.map((s) => (
              <span
                key={s.style}
                className="rounded-full border border-white/[0.08] bg-zinc-950/50 px-2 py-1 text-xs font-medium text-zinc-300"
              >
                {s.style.replace(/-/g, " ")} · {Math.round(s.share * 100)}%
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
