import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";

export type RecommendedCommunity = {
  communityId: string;
  name: string;
  score: number;
  label: string;
  isFallback: boolean;
  memberCount: number;
};

type ApiResponse = {
  recommendations: RecommendedCommunity[];
  isNewUser: boolean;
};

export function useRecommendedCommunities(loggedIn: boolean) {
  return useQuery({
    queryKey: queryKeys.recommendedCommunities(),
    queryFn: () => fetcher<ApiResponse>("/api/communities/recommended"),
    enabled: loggedIn,
    staleTime: 3 * 60 * 1000,
  });
}
