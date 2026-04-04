import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import type { CommunityConsensusItem } from "@/lib/api-communities";
import { theme } from "@/lib/theme";

type Props = {
  items: CommunityConsensusItem[];
  emptyLabel: string;
  entity: "album" | "artist";
};

export function HorizontalEntityCarousel({ items, emptyLabel, entity }: Props) {
  const router = useRouter();

  function hrefFor(item: CommunityConsensusItem): Href {
    return (
      entity === "album"
        ? `/album/${encodeURIComponent(item.entityId)}`
        : `/artist/${encodeURIComponent(item.entityId)}`
    ) as Href;
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => (
        <Pressable
          key={item.entityId}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => router.push(hrefFor(item))}
        >
          <View style={styles.artWrap}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.art} />
            ) : (
              <View style={styles.artPh}>
                <Text style={styles.artPhText}>♪</Text>
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.meta}>
            {item.uniqueListeners} listener{item.uniqueListeners === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingBottom: 4, paddingRight: 8 },
  card: {
    width: 132,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 10,
  },
  cardPressed: { opacity: 0.88 },
  artWrap: {
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: theme.colors.active,
  },
  art: { width: "100%", aspectRatio: 1, resizeMode: "cover" },
  artPh: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  artPhText: { fontSize: 28, color: theme.colors.muted },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    lineHeight: 17,
    minHeight: 34,
  },
  meta: { marginTop: 4, fontSize: 11, color: theme.colors.muted },
  emptyBox: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  emptyText: { fontSize: 13, color: theme.colors.muted, lineHeight: 18 },
});
