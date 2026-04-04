import { useQuery } from "@tanstack/react-query";
import type {
  HiddenGem,
  HiddenGemGridItem,
  RisingArtist,
  TrendingEntity,
} from "@repo/types";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";

export function useTrending(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "trending", limit],
    queryFn: () =>
      fetcher<TrendingEntity[]>(`/api/discover/trending?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRisingArtists(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "rising-artists", limit],
    queryFn: () =>
      fetcher<RisingArtist[]>(`/api/discover/rising-artists?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHiddenGems(limit = 10) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "hidden-gems", limit],
    queryFn: () =>
      fetcher<HiddenGem[]>(`/api/discover/hidden-gems?limit=${limit}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Catalog-enriched hidden gems for the Discover screen 2-column media grid. */
export function useHiddenGemsGrid(limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.discover(), "hidden-gems-grid", limit],
    queryFn: () =>
      fetcher<HiddenGemGridItem[]>(
        `/api/discover/hidden-gems/grid?limit=${limit}`,
      ),
    staleTime: 5 * 60 * 1000,
  });
}
