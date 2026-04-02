export type ChartType = "tracks" | "artists" | "albums";

export type WeeklyChartRankingRow = {
  entity_id: string;
  rank: number;
  play_count: number;
  prev_rank: number | null;
  movement: number | null;
  is_new: boolean;
  is_reentry: boolean;
  /** Weeks this entity appeared in your top 10 across prior stored charts (+ this week). */
  weeks_in_top_10: number;
  /** Weeks this entity was #1 across prior stored charts (+ this week if #1). */
  weeks_at_1: number;
  peak_rank: number;
};

/** Virtual rank for “not on last week’s chart” (below #10). */
export const WEEKLY_CHART_OFF_RANK = 11;

export type WeeklyChartMoverDropout = {
  kind: "dropout";
  entity_id: string;
  prev_rank: number;
  /** Always negative: prev_rank − WEEKLY_CHART_OFF_RANK (left the chart). */
  movement: number;
};

export type WeeklyChartMovers = {
  biggest_jump: WeeklyChartRankingRow | null;
  biggest_drop: WeeklyChartRankingRow | WeeklyChartMoverDropout | null;
  best_new_entry: WeeklyChartRankingRow | null;
};

export type WeeklyChartRecord = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  chart_type: ChartType;
  rankings: WeeklyChartRankingRow[];
  created_at: string;
};

/** Hydrated from catalog (not persisted). */
export type WeeklyChartHydratedFields = {
  name: string;
  image: string | null;
  /** Primary artist(s); album artist for albums; null for artist chart rows. */
  artist_name: string | null;
};

/**
 * API/client row: persisted `WeeklyChartRankingRow` + hydration + display flags.
 * Unknown / synthetic rows are dropped before the response is built.
 */
export type WeeklyChartRankingApiRow = WeeklyChartRankingRow &
  WeeklyChartHydratedFields & {
    is_number_one: boolean;
    is_top_3: boolean;
    has_positive_movement: boolean;
    has_negative_movement: boolean;
  };

export type ChartMomentTopRow = {
  rank: number;
  name: string;
  artist_name: string | null;
  movement: number | null;
  is_new: boolean;
};

export type ChartMomentPayload = {
  week_label: string;
  top_5: ChartMomentTopRow[];
  number_one: {
    name: string;
    artist_name: string | null;
    weeks_at_1: number;
  } | null;
};
