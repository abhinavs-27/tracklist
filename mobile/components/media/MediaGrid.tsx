import { useCallback } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Artwork } from "./Artwork";

export type MediaItem = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  rank?: number;
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
        style={{
          width: scrollEnabled ? undefined : `${100 / numColumns}%`,
          flex: scrollEnabled ? 1 : undefined,
          padding: scrollEnabled ? 0 : 8,
        }}
        activeOpacity={0.8}
        onPress={() => onPressItem?.(item)}
      >
        <View style={{ alignItems: "flex-start" }}>
          <Artwork src={item.artworkUrl} size="md" />
          <View style={{ marginTop: 8 }}>
            {item.rank != null && (
              <Text
                style={{
                  fontSize: 12,
                  color: "#a1a1aa", // zinc-400
                  marginBottom: 2,
                }}
              >
                #{item.rank}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: "600", color: "#f4f4f5" }} // zinc-100
            >
              {item.title}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }} // zinc-400
            >
              {item.artist}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    ),
    [scrollEnabled, numColumns, onPressItem],
  );

  if (!scrollEnabled) {
    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          margin: -8, // compensate for padding on items
        }}
      >
        {data.map(renderItem)}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item: MediaItem) => item.id}
      numColumns={numColumns}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
      renderItem={({ item }) => renderItem(item)}
    />
  );
}
