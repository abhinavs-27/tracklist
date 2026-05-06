import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetcher } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";
import type { TasteIdentity } from "@repo/lib/taste/types";

export function ExploreTastePreview() {
  const router = useRouter();
  const q = useQuery({
    queryKey: queryKeys.tasteIdentity("me"),
    queryFn: () => fetcher<TasteIdentity>("/api/taste-identity"),
    staleTime: 5 * 60 * 1000,
  });

  const t = q.data;
  if (!t || t.totalLogs === 0) return null;

  const insight = t.recent?.insightWeek?.trim() ? t.recent.insightWeek : t.summary?.trim();
  const genres =
    t.recent?.topGenres7d && t.recent.topGenres7d.length > 0
      ? t.recent.topGenres7d
      : t.topGenres;
  const genresLabel = t.recent?.topGenres7d?.length ? "This week" : "Top genres";

  // Nothing useful to show yet — don't render an empty card
  if (!insight && genres.length === 0) return null;

  return (
    <Pressable
      onPress={() => router.push("/profile" as const)}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.header}>
        <Text style={styles.label}>Your taste</Text>
        <Text style={styles.link}>Profile →</Text>
      </View>

      {insight ? (
        <Text style={styles.insight} numberOfLines={3}>
          {insight}
        </Text>
      ) : null}

      {genres.length > 0 ? (
        <View style={styles.genresBlock}>
          <Text style={styles.genresLabel}>{genresLabel}</Text>
          <View style={styles.genresRow}>
            {genres.slice(0, 6).map((g) => (
              <View key={g.name} style={styles.genrePill}>
                <Text style={styles.genreName}>{g.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  link: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  insight: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  genresBlock: {
    gap: 6,
  },
  genresLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  genresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  genrePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(91, 33, 182, 0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(139, 92, 246, 0.35)",
  },
  genreName: {
    fontSize: 12,
    color: theme.colors.text,
  },
});
