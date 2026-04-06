import { useQuery } from "@tanstack/react-query";
import { readStaleSessionCache, writeStaleSessionCache } from "@repo/lib/client/stale-session-cache";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { ExploreHubResponse } from "../types/explore-hub";

const EXPLORE_HUB_CACHE_KEY = "explore:hub";

export function useExploreHub() {
  const initial = readStaleSessionCache<ExploreHubResponse>(EXPLORE_HUB_CACHE_KEY);

  return useQuery({
    queryKey: queryKeys.exploreHub(),
    queryFn: async () => {
      const data = await fetcher<ExploreHubResponse>("/api/explore");
      writeStaleSessionCache(EXPLORE_HUB_CACHE_KEY, data);
      return data;
    },
    initialData: initial ?? undefined,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
  });
}
