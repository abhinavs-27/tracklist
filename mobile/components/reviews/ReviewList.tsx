import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type Review = {
  id: string;
  username: string | null;
  rating: number;
  review_text: string | null;
};

type Props = {
  reviews: Review[];
  viewAllLabel?: string;
  onViewAllPress?: () => void;
};

function RatingStars({ rating }: { rating: number }) {
  const safe = Math.max(1, Math.min(5, rating));
  return <Text style={styles.rating}>★ {safe.toFixed(0)}</Text>;
}

export function ReviewList({ reviews, viewAllLabel = "View all reviews", onViewAllPress }: Props) {
  const visible = reviews.slice(0, 5);

  if (visible.length === 0) {
    return <Text style={styles.empty}>No reviews yet.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {visible.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.user} numberOfLines={1}>
              {r.username ?? "Anonymous"}
            </Text>
            <RatingStars rating={r.rating} />
          </View>
          {r.review_text && (
            <Text style={styles.text} numberOfLines={3}>
              {r.review_text}
            </Text>
          )}
        </View>
      ))}

      {onViewAllPress && (
        <Pressable
          onPress={onViewAllPress}
          style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
        >
          <Text style={styles.viewAllText}>{viewAllLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  empty: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  user: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  rating: {
    color: theme.colors.amber,
    fontSize: 14,
    fontWeight: "900",
  },
  text: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  viewAll: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    alignItems: "center",
  },
  viewAllPressed: {
    opacity: 0.85,
  },
  viewAllText: {
    color: theme.colors.emerald,
    fontSize: 13,
    fontWeight: "800",
  },
});

