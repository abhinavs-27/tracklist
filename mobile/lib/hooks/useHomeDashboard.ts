import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { useAuth } from "./useAuth";

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
