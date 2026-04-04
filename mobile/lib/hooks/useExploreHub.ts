import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { ExploreHubResponse } from "../types/explore-hub";

export function useExploreHub() {
  return useQuery({
    queryKey: queryKeys.exploreHub(),
    queryFn: () => fetcher<ExploreHubResponse>("/api/explore"),
    staleTime: 60 * 1000,
  });
}
