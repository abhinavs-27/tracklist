import type { CommunityChartRankMovement } from "@/lib/charts/community-chart-rank-movement";

export type ChartType = "tracks" | "artists" | "albums";

/** Community billboard only: who drove plays for an entity this week. */
export type CommunityChartContributor = {
  user_id: string;
  username: string | null;
  play_count: number;
};

/** Community chart: explainability payload (API). */
export type CommunityChartRowBreakdown = {
  percent_of_community: number | null;
  total_plays: number;
  repeat_strength: number | null;
  top_contributors: CommunityChartContributor[];
};

export type WeeklyChartRankingRow = {
  entity_id: string;
  /** Current chart position (1–10). */
  rank: number;
  play_count: number;
  /** Rank on the prior published week’s chart, or null if not on that chart. */
  prev_rank: number | null;
  /**
   * Signed position change vs last week: positive = improved (fewer listeners rank number).
   * Debut/re-entry uses virtual drop from `WEEKLY_CHART_OFF_RANK` for mover scoring.
   */
  movement: number | null;
  /** Community: movement vs prior week only (not all-time debut). */
  rank_movement?: CommunityChartRankMovement;
  /** Community: positive spots moved (UP/DOWN), 0 when SAME, null when NEW. */
  rank_delta?: number | null;
  is_new: boolean;
  is_reentry: boolean;
  /** Weeks this entity appeared in your top 10 across prior stored charts (+ this week). */
  weeks_in_top_10: number;
  /** Weeks this entity was #1 across prior stored charts (+ this week if #1). */
  weeks_at_1: number;
  peak_rank: number;
  /** Community weekly chart: distinct members who played this entity at least once. */
  unique_listeners?: number;
  /** Community weekly chart: members with ≥1 listen in the chart window (denominator). */
  community_active_users?: number;
  /** unique_listeners / community_active_users (0–1), or null if no active users. */
  community_listen_percent?: number | null;
  /**
   * Community: mean capped plays per unique listener (each user counts at most 3 toward repeat).
   * Higher = more repeat listening vs one-off discovery.
   */
  repeat_strength?: number | null;
  top_contributors?: CommunityChartContributor[];
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
    /** Community API: ranking explainability. */
    community_breakdown?: CommunityChartRowBreakdown;
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
