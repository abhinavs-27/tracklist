import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "../../lib/hooks/useAuth";
import { getRouteForNotification } from "../../lib/notification-navigation";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "../../lib/hooks/useNotifications";
import { theme } from "../../lib/theme";
import type { EnrichedNotification } from "../../lib/types/notifications";
import { NotificationItem } from "./NotificationItem";

const DROPDOWN_MAX = 12;

export function NotificationsTray() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { session } = useAuth();
  const {
    notifications,
    isLoading,
    isRefetching,
    unreadCount,
    refetch,
  } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const preview = useMemo(
    () => notifications.slice(0, DROPDOWN_MAX),
    [notifications],
  );

  const hideBell =
    pathname === "/notifications" ||
    pathname?.includes("/(auth)") ||
    pathname?.includes("login");

  const onPressItem = useCallback(
    async (item: EnrichedNotification) => {
      setOpen(false);
      try {
        await markRead.mutateAsync([item.id]);
      } catch {
        /* ignore */
      }
      const route = getRouteForNotification(item);
      if (route) {
        router.push(route as never);
      }
    },
    [markRead, router],
  );

  const onViewAll = useCallback(() => {
    setOpen(false);
    router.push("/notifications");
  }, [router]);

  const panelWidth = Math.min(360, Dimensions.get("window").width - 24);
  const panelMaxH = Dimensions.get("window").height * 0.62;

  if (!session || hideBell) {
    return null;
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.bellWrap,
          {
            top: insets.top + 6,
            right: 14,
          },
        ]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Ionicons
          name="notifications-outline"
          size={26}
          color={theme.colors.text}
        />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? "99+" : String(unreadCount)}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.panel,
              {
                top: insets.top + 8,
                right: 12,
                width: panelWidth,
                maxHeight: panelMaxH,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notifications</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={theme.colors.muted} />
              </Pressable>
            </View>

            {isLoading && preview.length === 0 ? (
              <View style={styles.panelLoading}>
                <ActivityIndicator color={theme.colors.emerald} />
              </View>
            ) : (
              <ScrollView
                style={styles.scroll}
                nestedScrollEnabled
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching && !isLoading}
                    onRefresh={() => refetch()}
                    tintColor={theme.colors.emerald}
                    colors={[theme.colors.emerald]}
                  />
                }
              >
                {preview.length === 0 ? (
                  <Text style={styles.emptyPreview}>
                    No notifications yet
                  </Text>
                ) : (
                  preview.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 ? (
                        <View style={styles.sep} />
                      ) : null}
                      <NotificationItem item={item} onPress={onPressItem} />
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <Pressable
              onPress={onViewAll}
              style={({ pressed }) => [
                styles.viewAll,
                pressed && styles.viewAllPressed,
              ]}
            >
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.colors.emerald}
              />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: {
    position: "absolute",
    zIndex: 2000,
    elevation: 2000,
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  panel: {
    position: "absolute",
    backgroundColor: theme.colors.bg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text,
  },
  panelLoading: {
    paddingVertical: 32,
    alignItems: "center",
  },
  scroll: {
    maxHeight: Dimensions.get("window").height * 0.48,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 72,
  },
  emptyPreview: {
    padding: 20,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  viewAllPressed: {
    opacity: 0.85,
  },
  viewAllText: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
});
