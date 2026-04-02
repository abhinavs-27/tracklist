import {
  WEEKLY_CHART_OFF_RANK,
  type WeeklyChartMoverDropout,
  type WeeklyChartMovers,
  type WeeklyChartRankingRow,
} from "@/lib/charts/weekly-chart-types";

/**
 * Billboard-style movement: prev_rank − current_rank, where “off chart” = WEEKLY_CHART_OFF_RANK (11).
 * - Debut / re-entry from off-chart: (11 − rank) = positive jump.
 * - Fell within chart: negative movement if rank worsened.
 * - Left chart entirely: dropouts get prev_rank − 11 (negative).
 */
export function computeBiggestMovers(
  current: WeeklyChartRankingRow[],
  prev: WeeklyChartRankingRow[],
): WeeklyChartMovers {
  const OFF = WEEKLY_CHART_OFF_RANK;
  const prevById = new Map(prev.map((r) => [r.entity_id, r.rank]));
  const currentIds = new Set(current.map((r) => r.entity_id));

  let biggest_jump: WeeklyChartRankingRow | null = null;
  let biggest_jumpScore = -Infinity;

  let biggest_drop: WeeklyChartRankingRow | WeeklyChartMoverDropout | null = null;
  let biggest_dropScore = 0;

  let best_new_entry: WeeklyChartRankingRow | null = null;

  for (const r of current) {
    const pr = prevById.get(r.entity_id);
    const effectivePrev = pr ?? OFF;
    const mov = effectivePrev - r.rank;

    if (mov > biggest_jumpScore) {
      biggest_jumpScore = mov;
      biggest_jump = {
        ...r,
        movement: mov,
        prev_rank: pr ?? null,
      };
    }

    if (mov < biggest_dropScore) {
      biggest_dropScore = mov;
      biggest_drop = {
        ...r,
        movement: mov,
        prev_rank: pr ?? null,
      };
    }

    if (r.is_new) {
      if (!best_new_entry || r.rank < best_new_entry.rank) {
        best_new_entry = r;
      }
    }
  }

  for (const p of prev) {
    if (currentIds.has(p.entity_id)) continue;
    const mov = p.rank - OFF;
    if (mov < biggest_dropScore) {
      biggest_dropScore = mov;
      biggest_drop = {
        kind: "dropout",
        entity_id: p.entity_id,
        prev_rank: p.rank,
        movement: mov,
      };
    }
  }

  return { biggest_jump, biggest_drop, best_new_entry };
}
