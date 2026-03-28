import type { ListeningInsightsResult } from "@/lib/taste/listening-insights";

type Props = {
  data: ListeningInsightsResult;
  /** Limit rows; use with “View all” to reports */
  maxLines?: number;
  /** Omit duplicate title when wrapped in SectionBlock */
  embedded?: boolean;
};

function InsightGlyph({ text }: { text: string }) {
  const t = text.toLowerCase();
  const className = "h-4 w-4 shrink-0 text-zinc-500";

  if (t.includes("binge")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3c1.2 3.2 4 5.5 4 9a4 4 0 11-8 0c0-3.5 2.8-5.8 4-9z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M9 18h6M10 21h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (
    t.includes("late at night") ||
    t.includes("morning") ||
    t.includes("afternoon") ||
    t.includes("evening") ||
    t.includes("peaks")
  ) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 8v4l3 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (t.includes("favorite artists") || t.includes("stick with")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 21a9 9 0 100-18 9 9 0 000 18z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 11v5M9 8h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (t.includes("discovering")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (t.includes("album")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect
          x="5"
          y="4"
          width="14"
          height="16"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (t.includes("every day") || t.includes("bursts")) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 12c2-4 6-6 8-6s6 2 8 6c-2 4-6 6-8 6s-6-2-8-6z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5 2-4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ListeningInsights({ data, maxLines, embedded = false }: Props) {
  const { insights } = data;
  const insufficient =
    insights.length === 1 && insights[0] === "Not enough listening data yet";
  const lines =
    maxLines != null && maxLines > 0
      ? insights.slice(0, maxLines)
      : insights;
  const hiddenCount =
    maxLines != null && maxLines > 0
      ? Math.max(0, insights.length - lines.length)
      : 0;

  return (
    <section
      className={`rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-5 ${embedded ? "pt-4" : ""}`}
    >
      {embedded ? null : (
        <div className="border-b border-zinc-800/80 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Listening insights
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Recent habits — behavioral, not your taste profile
          </p>
        </div>
      )}

      {embedded ? (
        <p className="mb-3 text-xs text-zinc-500">
          Behavioral patterns from your recent logs — not your taste profile.
        </p>
      ) : null}

      {insufficient ? (
        <p className={`text-sm leading-relaxed text-zinc-500 ${embedded ? "" : "mt-4"}`}>
          {insights[0]}
        </p>
      ) : (
        <ul className={`flex flex-col gap-0 ${embedded ? "" : "mt-4"}`}>
          {lines.map((line, i) => (
            <li
              key={`${line}-${i}`}
              className="flex gap-3 border-b border-zinc-800/50 py-3.5 last:border-b-0 last:pb-0 first:pt-0"
            >
              <InsightGlyph text={line} />
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-200">
                {line}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!insufficient && hiddenCount > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          +{hiddenCount} more in listening reports
        </p>
      ) : null}
    </section>
  );
}
