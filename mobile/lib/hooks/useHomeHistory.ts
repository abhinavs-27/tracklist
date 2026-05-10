import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { useAuth } from "./useAuth";

// ─── Taste Timeline ────────────────────────────────────────────────────────────

export type TimelineArtist = {
  id: string;
  name: string;
  plays: number;
  imageUrl?: string;
};

export type TimelineGenre = {
  name: string;
  weight: number;
};

export type TimelineMonth = {
  month: string;
  monthLabel: string;
  topArtists: TimelineArtist[];
  topGenres: TimelineGenre[];
  totalLogs: number;
};

export type TasteTimelineResult = {
  months: TimelineMonth[];
  shifts: Array<"major" | "minor" | null>;
  hasData: boolean;
} | null;

export function useHomeTasteTimeline() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<TasteTimelineResult>({
    queryKey: ["home", "taste-timeline"],
    queryFn: () => fetcher<TasteTimelineResult>("/api/me/taste-timeline"),
    enabled: !!session && !authLoading,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export type BlindSpotArtist = {
  spotifyId: string;
  name: string;
  imageUrl?: string;
  genres: string[];
  becauseOf: string[];
};

export type TasteBlindSpotsResult = {
  artists: BlindSpotArtist[];
  hasData: boolean;
} | null;

export type ListeningReportPreviewArtist = {
  name: string;
  count: number;
  image: string | null;
};

export type ListeningReportPreviewData = {
  periodLabel: string;
  topArtists: ListeningReportPreviewArtist[];
  topGenre: { name: string; count: number } | null;
  totalPlays: number;
} | null;

export function useHomeBlindSpots() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<TasteBlindSpotsResult>({
    queryKey: ["home", "blind-spots"],
    queryFn: () => fetcher<TasteBlindSpotsResult>("/api/me/blind-spots"),
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useHomeListeningReport() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<ListeningReportPreviewData>({
    queryKey: ["home", "listening-report"],
    queryFn: () => fetcher<ListeningReportPreviewData>("/api/me/listening-report"),
    enabled: !!session && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// ─── Taste Insights ────────────────────────────────────────────────────────────

export type TasteArcResult = {
  kind: string;
  narrative: string;
  risingArtists: { id: string; name: string }[];
  stableArtists: { id: string; name: string }[];
};

export type DiscoveryStyleResult = {
  kind: string;
  narrative: string;
  newArtistsCount: number;
  revisitRate: number;
  recentFinds: { id: string; name: string; plays: number }[];
};

export type TasteMiniIdentity = {
  totalLogs: number;
  obscurityScore: number | null;
  diversityScore: number;
  topGenres: { name: string; weight: number }[];
} | null;

export type TasteInsightsData = {
  arc: TasteArcResult;
  discovery: DiscoveryStyleResult;
  taste: TasteMiniIdentity;
} | null;

export function useHomeTasteInsights() {
  const { session, isLoading: authLoading } = useAuth();

  return useQuery<TasteInsightsData>({
    queryKey: ["home", "taste-insights"],
    queryFn: () => fetcher<TasteInsightsData>("/api/me/taste-insights"),
    enabled: !!session && !authLoading,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
