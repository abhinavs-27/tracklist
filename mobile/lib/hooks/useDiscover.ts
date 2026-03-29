import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import { MediaItem } from "../../components/media/MediaGrid";

type TrendingResponse = {
  entity_id: string;
  entity_type: "song" | "album";
  score: number;
}[];

// Note: The web app fetches details for these IDs.
// For mobile, we might need an endpoint that returns enriched data or fetch them here.
// Looking at the web's /api/discover/trending, it returns raw trending entities.
// The web frontend then fetches details from Spotify cache.

export function useTrending(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "trending", limit],
    queryFn: () => fetcher<MediaItem[]>(`/api/discover/trending?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRisingArtists(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "rising-artists", limit],
    queryFn: () => fetcher<unknown[]>(`/api/discover/rising-artists?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHiddenGems(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "hidden-gems", limit],
    queryFn: () => fetcher<MediaItem[]>(`/api/discover/hidden-gems?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}
