import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "../api";

export type NotificationPreferences = {
  social: boolean;
  recommendations: boolean;
  community: boolean;
  charts: boolean;
};

const KEY = ["notification-preferences"] as const;

export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: () =>
      fetcher<NotificationPreferences>("/api/users/me/notification-preferences"),
    staleTime: 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      fetcher<{ ok: boolean }>("/api/users/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const prev = queryClient.getQueryData<NotificationPreferences>(KEY);
      if (prev) queryClient.setQueryData(KEY, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    setPreference: (key: keyof NotificationPreferences, value: boolean) =>
      mutation.mutate({ [key]: value }),
  };
}
