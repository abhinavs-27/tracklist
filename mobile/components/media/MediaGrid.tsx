import { Image } from "expo-image";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
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
  onPressInItem?: (item: MediaItem) => void;
  scrollEnabled?: boolean;
  showArtist?: boolean;
};

const GAP = 8;
const HORIZONTAL_PAD = 32; // 16px on each side from parent container

export function MediaGrid({ data, numColumns = 2, onPressItem, onPressInItem, scrollEnabled = true, showArtist = true }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const tileWidth = (screenWidth - HORIZONTAL_PAD - GAP * (numColumns - 1)) / numColumns;

  const renderItem = useCallback(
    ({ item }: { item: MediaItem }) => (
      <TouchableOpacity style={[styles.tile, { width: tileWidth }]} activeOpacity={0.8} onPress={() => onPressItem?.(item)} onPressIn={() => onPressInItem?.(item)}>
        <View style={styles.artWrap}>
          {item.artworkUrl ? (
            <Image source={{ uri: item.artworkUrl }} style={styles.art} contentFit="cover" />
          ) : (
            <View style={[styles.art, styles.artPlaceholder]}>
              <Text style={styles.artGlyph}>♪</Text>
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
          {showArtist && <Text numberOfLines={1} style={styles.artist}>{item.artist}</Text>}
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
    [onPressItem, onPressInItem, tileWidth, showArtist],
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      renderItem={renderItem}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
      contentContainerStyle={scrollEnabled ? styles.scrollPad : undefined}
      removeClippedSubviews
      initialNumToRender={12}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    gap: GAP,
    justifyContent: "flex-start",
  },
  scrollPad: {
    padding: 16,
  },
  tile: {
    borderRadius: 16,
    backgroundColor: "rgba(24,24,27,0.58)",
    borderWidth: 1,
    borderColor: "rgba(39,39,42,0.75)",
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 11,
  },
  artWrap: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  artPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  artGlyph: {
    fontSize: 20,
    color: theme.colors.muted,
  },
  rankBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rankText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },
  meta: {
    marginTop: 7,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    lineHeight: 16,
  },
  artist: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  rating: {
    fontSize: 11,
    fontWeight: "500",
    color: "#fbbf24",
  },
  plays: {
    fontSize: 11,
    color: theme.colors.muted,
  },
});
