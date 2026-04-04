import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";
import type { UserListSummary } from "@/lib/types/user-list";
import { Artwork } from "@/components/media/Artwork";

type Props = {
  list: UserListSummary;
  width: number;
  onPress: () => void;
};

function UserListCardInner({ list, width, onPress }: Props) {
  const cover = list.image_url?.trim() || null;
  const countLabel = `${list.item_count} ${list.item_count === 1 ? "item" : "items"}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.imageWrap}>
        {cover ? (
          <Artwork
            src={cover}
            size="lg"
            style={{ width, height: width, borderRadius: 12 }}
          />
        ) : (
          <View style={[styles.placeholder, { width, height: width }]}>
            <Text style={styles.emoji}>{list.emoji ?? "📋"}</Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {list.title}
      </Text>
      <Text style={styles.meta}>{countLabel}</Text>
    </Pressable>
  );
}

export const UserListCard = memo(UserListCardInner);

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.88,
  },
  imageWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  placeholder: {
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.text,
    lineHeight: 18,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
