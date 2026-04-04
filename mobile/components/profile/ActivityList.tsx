import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";
import type { ProfileActivityItem } from "@/lib/hooks/useProfile";
import { Artwork } from "@/components/media/Artwork";

/** Single activity row — use inside parent `FlatList` `renderItem` on the profile screen. */
export const ProfileActivityRow = memo(function ProfileActivityRow({
  item,
  onPressAlbum,
}: {
  item: ProfileActivityItem;
  onPressAlbum: (albumId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressAlbum(item.albumId)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Artwork src={item.artworkUrl} size="sm" />
      <View style={styles.rowText}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={styles.action}>{item.actionLabel}</Text>
    </Pressable>
  );
});

export function ActivityEmpty() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>Nothing here yet</Text>
    </View>
  );
}

export function ActivitySeparator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  empty: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.emerald,
  },
  action: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  sep: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 76,
  },
});
