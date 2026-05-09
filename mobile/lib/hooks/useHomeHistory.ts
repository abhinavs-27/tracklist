import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { useAuth } from "./useAuth";

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
