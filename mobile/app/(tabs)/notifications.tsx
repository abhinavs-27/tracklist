import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { getRouteForNotification } from "@/lib/notification-navigation";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/lib/hooks/useNotifications";
import { theme } from "@/lib/theme";
import type { EnrichedNotification } from "@/lib/types/notifications";

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [router]);

  const onPressItem = useCallback(
    async (item: EnrichedNotification) => {
      try {
        await markRead.mutateAsync([item.id]);
      } catch {
        /* still navigate */
      }
      const route = getRouteForNotification(item);
      if (route) {
        router.push(route as never);
      }
    },
    [markRead, router],
  );

  const onMarkAllRead = useCallback(() => {
    markRead.mutate(undefined);
  }, [markRead]);

  const headerRight =
    notifications.some((n) => !n.read) ? (
      <Pressable
        onPress={onMarkAllRead}
        hitSlop={12}
        style={({ pressed }) => [styles.markAllBtn, pressed && styles.markAllPressed]}
        disabled={markRead.isPending}
      >
        <Text style={styles.markAllText}>Mark all read</Text>
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.pageHeader}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>
            Activity about your profile, follows, and lists
          </Text>
        </View>
        {headerRight}
      </View>
      <NotificationsList
        data={notifications}
        isLoading={isLoading}
        isRefetching={isRefetching}
        error={
          error instanceof Error
            ? error
            : error
              ? new Error(String(error))
              : null
        }
        onRefresh={() => refetch()}
        onRetry={() => refetch()}
        onPressItem={onPressItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  backBtn: {
    padding: 4,
    marginTop: 2,
  },
  backPressed: {
    opacity: 0.75,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  markAllBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  markAllPressed: {
    opacity: 0.75,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
});
