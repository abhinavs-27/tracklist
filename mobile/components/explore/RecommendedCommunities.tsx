import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";
import type { RecommendedCommunity } from "@/lib/hooks/useRecommendedCommunities";

type Props = {
  items: RecommendedCommunity[];
};

export function RecommendedCommunities({ items }: Props) {
  const router = useRouter();

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Recommended for you</Text>
        <Pressable
          onPress={() => router.push("/communities" as const)}
          hitSlop={8}
        >
          <Text style={styles.browseLink}>All →</Text>
        </Pressable>
      </View>
      <Text style={styles.desc}>
        Communities matched to your recent listening.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {items.map((c) => (
          <Pressable
            key={c.communityId}
            onPress={() =>
              router.push(`/communities/${c.communityId}` as const)
            }
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.cardName} numberOfLines={2}>
              {c.name}
            </Text>
            <View style={styles.cardMeta}>
              {c.isFallback ? (
                <Text style={styles.labelNeutral}>
                  {c.label}
                  {c.memberCount > 0 ? ` · ${c.memberCount} members` : ""}
                </Text>
              ) : (
                <>
                  <Text style={styles.pct}>
                    {Math.round(c.score * 100)}%
                  </Text>
                  <Text style={styles.labelNeutral}>{c.label}</Text>
                </>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  browseLink: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.gold,
  },
  desc: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 19,
  },
  scroll: {
    gap: 10,
    paddingRight: 18,
  },
  card: {
    width: 200,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  pct: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.gold,
  },
  labelNeutral: {
    fontSize: 12,
    color: theme.colors.muted,
  },
});
