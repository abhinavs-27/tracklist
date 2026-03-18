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
};

export function MediaGrid({ data, numColumns = 2, onPressItem }: Props) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ flex: 1 }}
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
                    color: "#6B7280",
                    marginBottom: 2,
                  }}
                >
                  #{item.rank}
                </Text>
              )}
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}
              >
                {item.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}
              >
                {item.artist}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

