/**
 * Community weekly chart: rank change vs prior published week only (not all-time debut).
 */
export type CommunityChartRankMovement = "NEW" | "UP" | "DOWN" | "SAME";

export function computeCommunityRankMovement(args: {
  current_rank: number;
  previous_rank: number | null;
}): {
  rank_movement: CommunityChartRankMovement;
  rank_delta: number | null;
  /** Legacy billboard delta: previous_rank − current_rank (positive = improved). */
  movement_numeric: number | null;
} {
  const { current_rank, previous_rank } = args;
  if (previous_rank == null) {
    return {
      rank_movement: "NEW",
      rank_delta: null,
      movement_numeric: null,
    };
  }
  if (current_rank < previous_rank) {
    const delta = previous_rank - current_rank;
    return {
      rank_movement: "UP",
      rank_delta: delta,
      movement_numeric: delta,
    };
  }
  if (current_rank > previous_rank) {
    const delta = current_rank - previous_rank;
    return {
      rank_movement: "DOWN",
      rank_delta: delta,
      movement_numeric: -delta,
    };
  }
  return {
    rank_movement: "SAME",
    rank_delta: 0,
    movement_numeric: 0,
  };
}
