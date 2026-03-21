import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";
import type { ProfileListSummary } from "../../lib/hooks/useProfile";

type Props = {
  lists: ProfileListSummary[];
  isOwnProfile: boolean;
};

/** Mirrors web profile “Lists” block (read-only in app; full editing on web). */
export function ProfileListsSection({ lists, isOwnProfile }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Lists</Text>
      {lists.length === 0 ? (
        <Text style={styles.empty}>
          {isOwnProfile
            ? "You haven't created any lists yet."
            : "No lists yet."}
        </Text>
      ) : (
        <View style={styles.list}>
          {lists.map((l) => (
            <View key={l.id} style={styles.card}>
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
            </View>
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
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
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
