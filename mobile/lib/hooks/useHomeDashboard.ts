import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { useAuth } from "./useAuth";
import { CACHE_KEYS, readCache, writeCache } from "../persistent-cache";

// ─── Weekly chart types (mirrors server WeeklyChartRankingApiRow) ──────────────

export type ChartRankingRow = {
  entity_id: string;
  rank: number;
  play_count: number;
  prev_rank: number | null;
  movement: number | null;
  is_new: boolean;
  is_reentry: boolean;
  weeks_in_top_10: number;
  weeks_at_1: number;
  peak_rank: number;
  name: string;
  image: string | null;
  artist_name: string | null;
  is_number_one: boolean;
  is_top_3: boolean;
  has_positive_movement: boolean;
  has_negative_movement: boolean;
};

export type ChartDropout = {
  kind: "dropout";
  entity_id: string;
  prev_rank: number;
  movement: number;
  name: string;
  image: string | null;
  artist_name: string | null;
};

export type ChartMoverEntry = ChartRankingRow | ChartDropout | null;

export type WeeklyChartMovers = {
  biggest_jump: ChartRankingRow | null;
  biggest_drop: ChartMoverEntry;
  best_new_entry: ChartRankingRow | null;
};

export type WeeklyChartResult = {
  rankings: ChartRankingRow[];
  narrative: string[];
  movers: WeeklyChartMovers;
  chart_moment: { week_label: string };
  share: { weekLabel: string };
};

export function isDropout(m: ChartMoverEntry): m is ChartDropout {
  return m != null && "kind" in m && (m as ChartDropout).kind === "dropout";
}

export type TopArtistItem = {
  artistId: string;
  name: string;
  playCount: number;
  imageUrl: string | null;
};

export type TopAlbumItem = {
  albumId: string;
  name: string;
  artistName: string;
  playCount: number;
  imageUrl: string | null;
};

export type TopTrackItem = {
  trackId: string;
  albumId: string;
  name: string;
  artistName: string;
  albumImageUrl: string | null;
  playCount: number;
};

export type TopThisWeekResult = {
  artists: TopArtistItem[];
  albums: TopAlbumItem[];
  tracks: TopTrackItem[];
  rangeLabel: string;
} | null;

export type BillboardData = {
  weeklyTop: TopThisWeekResult;
  narrative: string | null;
};

export type PulseTrend = "up" | "down" | "flat";

export type ProfilePulseInsights = {
  rangeCaption: string;
  playVolume: {
    trend: PulseTrend;
    percentChange: number;
    currentPlays: number;
    previousPlays: number;
  } | null;
  genreChange: {
    name: string;
    trend: PulseTrend;
    caption: string;
  } | null;
  artistChange: {
    name: string;
    trend: PulseTrend;
    caption: string;
  } | null;
  discoveries: { names: string[] } | null;
  soundShift: { trend: PulseTrend; headline: string; detail: string } | null;
} | null;

// ─── Home bundle (single request replaces billboard + pulse fetches) ───────────

export type HomeBundleData = {
  billboard: BillboardData;
  pulse: ProfilePulseInsights;
};

export function useHomeBundle() {
  const { session, isLoading: authLoading } = useAuth();
  const cached = readCache<HomeBundleData>(CACHE_KEYS.homeBundle);

  return useQuery<HomeBundleData>({
    queryKey: ["home", "bundle"],
    queryFn: async () => {
      const data = await fetcher<HomeBundleData>("/api/me/home-bundle");
      writeCache(CACHE_KEYS.homeBundle, data);
      return data;
    },
    initialData: cached ?? undefined,
    initialDataUpdatedAt: 0,
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export type ChartType = "tracks" | "artists" | "albums";

export type WeekOption = { week_start: string; week_end: string };

export function useWeeklyChart(chartType: ChartType = "tracks", weekStart: string | null = null) {
  const { session, isLoading: authLoading } = useAuth();
  return useQuery<WeeklyChartResult | null>({
    queryKey: ["home", "weekly-chart", chartType, weekStart ?? "latest"],
    queryFn: () => {
      const params = new URLSearchParams({ type: chartType });
      if (weekStart) params.set("weekStart", weekStart);
      return fetcher<WeeklyChartResult>(`/api/charts?${params.toString()}`).catch(() => null);
    },
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useWeeklyChartWeeks(chartType: ChartType) {
  const { session, isLoading: authLoading } = useAuth();
  return useQuery<WeekOption[]>({
    queryKey: ["home", "weekly-chart-weeks", chartType],
    queryFn: () =>
      fetcher<{ weeks: WeekOption[] }>(`/api/charts/weeks?type=${chartType}&limit=52`)
        .then((r) => r.weeks ?? [])
        .catch(() => []),
    enabled: !!session && !authLoading,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}
