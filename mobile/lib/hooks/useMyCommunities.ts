import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetchMyCommunities } from "../api-communities";

export function useMyCommunities() {
  return useQuery({
    queryKey: queryKeys.communitiesMine(),
    queryFn: () => fetchMyCommunities().then((r) => r.communities),
  });
}
