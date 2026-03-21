import { Pressable, Text, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "../../lib/theme";
import type { ProfileListSummary } from "../../lib/hooks/useProfile";

type Props = {
  lists: ProfileListSummary[];
  isOwnProfile: boolean;
  username: string;
  /** Opens create-list flow (parent renders modal). */
  onPressCreate?: () => void;
};

/** Mirrors web profile “Lists” block; tap opens list detail, “See all” opens the grid screen. */
export function ProfileListsSection({
  lists,
  isOwnProfile,
  username,
  onPressCreate,
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Lists</Text>
        {lists.length > 0 ? (
          <Pressable
            onPress={() =>
              router.push(`/user/${encodeURIComponent(username)}/lists`)
            }
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      {isOwnProfile && onPressCreate ? (
        <Pressable
          onPress={onPressCreate}
          style={({ pressed }) => [styles.createRow, pressed && styles.pressed]}
        >
          <Text style={styles.createBtn}>+ Create new list</Text>
        </Pressable>
      ) : null}
      {lists.length === 0 ? (
        <Text style={styles.empty}>
          {isOwnProfile
            ? "You haven't created any lists yet."
            : "No lists yet."}
        </Text>
      ) : (
        <View style={styles.list}>
          {lists.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/list/${l.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                {l.title}
              </Text>
              {l.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {l.description}
                </Text>
              ) : null}
              <Text style={styles.cardMeta}>
                {l.item_count} {l.item_count === 1 ? "item" : "items"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    flex: 1,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  createRow: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  createBtn: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  pressed: {
    opacity: 0.85,
  },
  empty: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  list: {
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
  },
  cardDesc: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
    lineHeight: 18,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
