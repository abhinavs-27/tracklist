import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "../lib/hooks/useAuth";
import { queryKeys } from "../lib/query-keys";
import {
  Notifications,
  registerPushWithBackend,
  routeFromPushData,
} from "../lib/notifications";

/**
 * Registers Expo push (when signed in), syncs list on foreground notifications,
 * and handles notification taps (deep links).
 */
export function NotificationsBootstrap() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastRegisteredUid = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!session?.user?.id) {
      lastRegisteredUid.current = null;
      return;
    }
    if (lastRegisteredUid.current === session.user.id) return;
    lastRegisteredUid.current = session.user.id;
    void registerPushWithBackend();
  }, [isLoading, session?.user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content
          .data as Record<string, unknown> | undefined;
        const route = routeFromPushData(data);
        if (route) {
          router.push(route as never);
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications() });
      },
    );
    return () => sub.remove();
  }, [queryClient, router]);

  return null;
}
