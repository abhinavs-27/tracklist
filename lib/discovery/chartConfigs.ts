/**
 * Chart configuration for the discovery engine.
 * Describes how each chart is computed (metric, formula, filters).
 */

export type ChartConfig = {
  id: string;
  label: string;
  /** Primary sort metric (e.g. total_plays). */
  metric?: string;
  /** Score formula (e.g. avg_rating * log10(1 + total_plays)). */
  formula?: string;
  /** Threshold filters applied before ranking. Keys are filter names, values are thresholds. */
  filters?: Record<string, number>;
};

export const CHART_CONFIGS: Record<string, ChartConfig> = {
  popular: {
    id: "popular",
    label: "Most Popular",
    metric: "total_plays",
  },
  top_rated: {
    id: "top_rated",
    label: "Top Rated",
    formula: "avg_rating * log10(1 + total_plays)",
  },
  favorited: {
    id: "favorited",
    label: "Most Favorited",
    metric: "favorite_count",
  },
  hidden_gems: {
    id: "hidden_gems",
    label: "Hidden Gems",
    filters: {
      /** Aligned with `mv_hidden_gems` + discover-cache MV fast path (min 4, max 50 listens). */
      min_rating: 4,
      max_plays: 50,
    },
  },
  trending: {
    id: "trending",
    label: "Trending",
    metric: "listen_count_recent",
    /** Aligned with `mv_trending_entities` (migrations 091–093): rolling 7d window, min listens. */
    filters: {
      min_listens_7d: 2,
    },
  },
  polarizing: {
    id: "polarizing",
    label: "Polarizing",
    formula: "rating_stddev * review_count",
  },
};

export function getChartConfig(chartId: string): ChartConfig | undefined {
  return CHART_CONFIGS[chartId];
}

export function getAllCharts(): ChartConfig[] {
  return Object.values(CHART_CONFIGS);
}

/** Map leaderboard UI type to chart config id (for labels and future engine use). */
export const LEADERBOARD_TYPE_TO_CHART_ID: Record<
  "popular" | "topRated" | "mostFavorited",
  string
> = {
  popular: "popular",
  topRated: "top_rated",
  mostFavorited: "favorited",
};
