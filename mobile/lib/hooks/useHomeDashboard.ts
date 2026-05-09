import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { useAuth } from "./useAuth";

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

export function useHomeBillboard() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<BillboardData>({
    queryKey: ["home", "billboard"],
    queryFn: () => fetcher<BillboardData>("/api/me/billboard"),
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useHomePulse() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<ProfilePulseInsights>({
    queryKey: ["home", "pulse"],
    queryFn: () => fetcher<ProfilePulseInsights>("/api/me/pulse"),
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useWeeklyChart(chartType: "tracks" | "artists" | "albums" = "tracks") {
  const { session, isLoading: authLoading } = useAuth();
  return useQuery<WeeklyChartResult | null>({
    queryKey: ["home", "weekly-chart", chartType],
    queryFn: () =>
      fetcher<WeeklyChartResult>(`/api/charts?type=${chartType}`).catch(() => null),
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
