import { memo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../lib/theme";
import {
  notificationPrimaryLine,
  notificationSecondaryLine,
} from "../../lib/notification-copy";
import { formatRelativeTime } from "../../lib/time";
import type { EnrichedNotification } from "../../lib/types/notifications";

type Props = {
  item: EnrichedNotification;
  onPress: (item: EnrichedNotification) => void;
};

function NotificationItemInner({ item, onPress }: Props) {
  const primary = notificationPrimaryLine(item, item.actor);
  const secondary = notificationSecondaryLine(item);
  const time = formatRelativeTime(item.created_at);
  const unread = !item.read;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      {item.actor?.avatar_url ? (
        <Image
          source={{ uri: item.actor.avatar_url }}
          style={styles.avatarImg}
        />
      ) : (
        <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
          <Text style={styles.avatarGlyph}>
            {(item.actor?.username ?? "?")[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.primary, unread && styles.primaryUnread]}
            numberOfLines={3}
          >
            {primary}
          </Text>
          {unread ? <View style={styles.dot} /> : null}
        </View>
        {secondary ? (
          <Text style={styles.secondary} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
        <Text style={styles.time}>{time}</Text>
      </View>
    </Pressable>
  );
}

export const NotificationItem = memo(NotificationItemInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.bg,
  },
  rowUnread: {
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
  pressed: {
    opacity: 0.88,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlyph: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  primary: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  primaryUnread: {
    fontWeight: "800",
    color: theme.colors.text,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.emerald,
  },
  secondary: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  time: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
  },
});
