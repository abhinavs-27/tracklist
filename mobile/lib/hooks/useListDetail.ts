import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { ListDetailResponse } from "../types/list-detail";

export function useListDetail(listId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.list(listId ?? ""),
    queryFn: () =>
      fetcher<ListDetailResponse>(
        `/api/lists/${encodeURIComponent(listId!)}`,
      ),
    enabled: !!listId,
    staleTime: 30 * 1000,
  });
}
