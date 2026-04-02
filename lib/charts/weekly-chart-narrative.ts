import type {
  ChartMomentPayload,
  ChartType,
  WeeklyChartRankingApiRow,
} from "@/lib/charts/weekly-chart-types";

type NarrativeInputRow = Pick<
  WeeklyChartRankingApiRow,
  | "rank"
  | "name"
  | "artist_name"
  | "weeks_at_1"
  | "is_new"
  | "movement"
  | "rank_movement"
  | "rank_delta"
>;

/**
 * 2–4 short insights from chart rankings (hydrated names).
 */
export function generateWeeklyNarrative(args: {
  chart_type: ChartType;
  rankings: NarrativeInputRow[];
}): string[] {
  const { chart_type, rankings } = args;
  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
  const insights: string[] = [];

  const chartLeader = sorted[0];
  if (chartLeader && chartLeader.weeks_at_1 >= 3) {
    insights.push(
      `Your #1 has spent ${chartLeader.weeks_at_1} weeks at #1.`,
    );
  }

  const newCount = sorted.filter((r) => r.is_new).length;
  if (newCount >= 3) {
    insights.push(`You had ${newCount} new entries this week.`);
  }

  if (chart_type === "tracks" || chart_type === "albums") {
    const byKey = new Map<string, { n: number; label: string }>();
    for (const r of sorted) {
      const label = r.artist_name?.trim();
      if (!label) continue;
      const k = label.toLowerCase();
      const prev = byKey.get(k);
      if (prev) prev.n += 1;
      else byKey.set(k, { n: 1, label });
    }
    const candidates = [...byKey.values()].filter((x) => x.n >= 2);
    candidates.sort((a, b) => b.n - a.n);
    const top = candidates[0];
    if (top) {
      insights.push(`Your week was dominated by ${top.label}.`);
    }
  }

  let bestMove = -1;
  let bestName: string | null = null;
  for (const r of sorted) {
    if (r.movement != null && r.movement > 0 && r.movement > bestMove) {
      bestMove = r.movement;
      bestName = r.name;
    }
  }
  if (bestName != null && bestMove > 0) {
    insights.push(`Biggest jump: ${bestName} climbed ${bestMove} spots.`);
  }

  return insights.slice(0, 4);
}

/** Community billboard copy (shared listening, not “your”). */
export function generateCommunityWeeklyNarrative(args: {
  chart_type: ChartType;
  rankings: NarrativeInputRow[];
}): string[] {
  const { chart_type, rankings } = args;
  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
  const insights: string[] = [];

  const chartLeader = sorted[0];
  if (chartLeader && chartLeader.weeks_at_1 >= 3) {
    insights.push(
      `The #1 has spent ${chartLeader.weeks_at_1} weeks at #1 on this community chart.`,
    );
  }

  const newCount = sorted.filter((r) => r.is_new).length;
  if (newCount >= 3) {
    insights.push(`The community had ${newCount} new entries this week.`);
  }

  if (chart_type === "tracks" || chart_type === "albums") {
    const byKey = new Map<string, { n: number; label: string }>();
    for (const r of sorted) {
      const label = r.artist_name?.trim();
      if (!label) continue;
      const k = label.toLowerCase();
      const prev = byKey.get(k);
      if (prev) prev.n += 1;
      else byKey.set(k, { n: 1, label });
    }
    const candidates = [...byKey.values()].filter((x) => x.n >= 2);
    candidates.sort((a, b) => b.n - a.n);
    const top = candidates[0];
    if (top) {
      insights.push(`The week leaned heavily on ${top.label}.`);
    }
  }

  let bestMove = -1;
  let bestName: string | null = null;
  for (const r of sorted) {
    if (r.rank_movement === "UP" && r.rank_delta != null && r.rank_delta > bestMove) {
      bestMove = r.rank_delta;
      bestName = r.name;
    } else if (
      r.rank_movement == null &&
      r.movement != null &&
      r.movement > bestMove
    ) {
      bestMove = r.movement;
      bestName = r.name;
    }
  }
  if (bestName != null && bestMove > 0) {
    insights.push(`Biggest jump: ${bestName} climbed ${bestMove} spots.`);
  }

  return insights.slice(0, 4);
}

export function generateChartMoment(args: {
  week_label: string;
  rankings: WeeklyChartRankingApiRow[];
}): ChartMomentPayload {
  const sorted = [...args.rankings].sort((a, b) => a.rank - b.rank);
  const top = sorted.slice(0, 5);
  const one = sorted[0] ?? null;

  return {
    week_label: args.week_label,
    top_5: top.map((r) => ({
      rank: r.rank,
      name: r.name,
      artist_name: r.artist_name,
      movement: r.movement,
      is_new: r.is_new,
    })),
    number_one: one
      ? {
          name: one.name,
          artist_name: one.artist_name,
          weeks_at_1: one.weeks_at_1,
        }
      : null,
  };
}
