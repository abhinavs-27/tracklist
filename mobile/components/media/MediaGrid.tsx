import { Image } from "expo-image";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { theme } from "@/lib/theme";

export type MediaItem = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  rank?: number;
  avgRating?: number;
  totalPlays?: number;
};

type Props = {
  data: MediaItem[];
  numColumns?: number;
  onPressItem?: (item: MediaItem) => void;
  scrollEnabled?: boolean;
};

export function MediaGrid({
  data,
  numColumns = 2,
  onPressItem,
  scrollEnabled = true,
}: Props) {
  const renderItem = useCallback(
    (item: MediaItem) => (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.tile,
          { width: scrollEnabled ? undefined : `${100 / numColumns}%` as unknown as number },
          scrollEnabled && { flex: 1 },
        ]}
        activeOpacity={0.8}
        onPress={() => onPressItem?.(item)}
      >
        {/* Full-width square artwork — matches web tile */}
        <View style={styles.artWrap}>
          {item.artworkUrl ? (
            <Image source={{ uri: item.artworkUrl }} style={styles.art} contentFit="cover" />
          ) : (
            <View style={[styles.art, styles.artPlaceholder]}>
              <Text style={{ fontSize: 20, color: theme.colors.muted }}>♪</Text>
            </View>
          )}
          {item.rank != null && (
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{item.rank}</Text>
            </View>
          )}
        </View>

        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{item.artist}</Text>
          {(item.avgRating != null || item.totalPlays != null) && (
            <View style={styles.statsRow}>
              {item.avgRating != null && (
                <Text style={styles.rating}>★ {item.avgRating.toFixed(1)}</Text>
              )}
              {item.totalPlays != null && item.totalPlays > 0 && (
                <Text style={styles.plays}>{item.totalPlays.toLocaleString()} plays</Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    ),
    [scrollEnabled, numColumns, onPressItem],
  );

  if (!scrollEnabled) {
    return (
      <View style={styles.grid}>
        {data.map(renderItem)}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item: MediaItem) => item.id}
      numColumns={numColumns}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
      renderItem={({ item }) => renderItem(item)}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
  },
  tile: {
    padding: 6,
  },
  artWrap: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: theme.colors.active,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  artPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(9,9,11,0.85)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rankText: { fontSize: 11, fontWeight: "600", color: "#d4d4d8" },
  meta: { marginTop: 6, paddingHorizontal: 2 },
  title: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
  artist: { fontSize: 11, color: theme.colors.muted, marginTop: 1 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  rating: { fontSize: 11, color: "#fbbf24" },
  plays: { fontSize: 11, color: theme.colors.muted },
});
