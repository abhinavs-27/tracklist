import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { ExploreDiscoveryBundle } from "../types/explore-hub";

export type ExploreRangeParam = "24h" | "week";

export function useExploreDiscoveryBundle(range: ExploreRangeParam) {
  return useQuery({
    queryKey: queryKeys.exploreDiscoveryBundle(range),
    queryFn: () =>
      fetcher<ExploreDiscoveryBundle>(
        `/api/explore/discovery-bundle?range=${range === "24h" ? "24h" : "week"}`,
      ),
    staleTime: 60 * 1000,
  });
}
