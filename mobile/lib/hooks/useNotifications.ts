import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetcher } from "../api";

export type NotificationRow = {
  id: string;
  type: string;
  created_at: string;
  payload?: unknown;
};

type NotificationsResponse = {
  notifications: NotificationRow[];
};

export function useNotifications() {
  const key = ["notifications"] as const;

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: key,
    queryFn: () => fetcher<NotificationsResponse>("/api/notifications"),
    staleTime: 30 * 1000,
  });

  return {
    notifications: data?.notifications ?? [],
    isLoading,
    error,
    refetch,
    isRefetching,
  };
}

