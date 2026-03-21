import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import { supabase } from "../supabase";
import type {
  EnrichedNotification,
  NotificationActor,
  NotificationRow,
} from "../types/notifications";

type NotificationsResponse = {
  notifications: NotificationRow[];
};

async function fetchActors(
  ids: string[],
): Promise<NotificationActor[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .in("id", ids);
  if (error) {
    console.warn("[notifications] fetchActors:", error.message);
    return [];
  }
  return (data ?? []) as NotificationActor[];
}

export function useNotifications() {
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => fetcher<NotificationsResponse>("/api/notifications"),
    staleTime: 30 * 1000,
  });

  const rows = notificationsQuery.data?.notifications ?? [];
  const actorIds = useMemo(() => {
    const s = new Set<string>();
    for (const n of rows) {
      if (n.actor_user_id) s.add(n.actor_user_id);
    }
    return [...s];
  }, [rows]);

  const actorsQuery = useQuery({
    queryKey: [...queryKeys.notifications(), "actors", actorIds.join(",")] as const,
    queryFn: () => fetchActors(actorIds),
    enabled:
      actorIds.length > 0 && !!notificationsQuery.data && !notificationsQuery.isError,
    staleTime: 60 * 1000,
  });

  const enriched: EnrichedNotification[] = useMemo(() => {
    const map = new Map(
      (actorsQuery.data ?? []).map((a) => [a.id, a] as const),
    );
    return rows.map((n) => ({
      ...n,
      actor: n.actor_user_id ? map.get(n.actor_user_id) ?? null : null,
    }));
  }, [rows, actorsQuery.data]);

  const unreadCount = useMemo(
    () => rows.filter((n) => !n.read).length,
    [rows],
  );

  return {
    notifications: enriched,
    unreadCount,
    isLoading: notificationsQuery.isLoading,
    isRefetching: notificationsQuery.isRefetching,
    error: notificationsQuery.error,
    refetch: notificationsQuery.refetch,
  };
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationIds?: string[]) => {
      await fetcher<{ ok: boolean }>("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          notificationIds?.length ? { notification_ids: notificationIds } : {},
        ),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}
