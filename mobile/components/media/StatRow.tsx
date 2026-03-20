import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";

type Props = {
  averageRating: number | null;
  totalPlays: number;
  favoriteCount: number;
  reviewCount: number;
};

export function StatRow({ averageRating, totalPlays, favoriteCount, reviewCount }: Props) {
  const showAny = totalPlays > 0 || reviewCount > 0 || favoriteCount > 0;

  if (!showAny) {
    return <Text style={styles.empty}>No listens, reviews, or favorites yet</Text>;
  }

  return (
    <View style={styles.wrap}>
      {averageRating != null && (
        <Text style={styles.amber}>
          ★ {averageRating.toFixed(1)}
        </Text>
      )}

      {totalPlays > 0 && (
        <Text style={styles.muted}>
          {totalPlays.toLocaleString()} play{totalPlays !== 1 ? "s" : ""}
        </Text>
      )}

      {favoriteCount > 0 && (
        <Text style={styles.muted}>
          {favoriteCount.toLocaleString()} favorite{favoriteCount !== 1 ? "s" : ""}
        </Text>
      )}

      {reviewCount > 0 && (
        <Text style={styles.muted}>
          {reviewCount} review{reviewCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    paddingVertical: 2,
  },
  empty: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  amber: {
    color: theme.colors.amber,
    fontSize: 14,
    fontWeight: "800",
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
});

