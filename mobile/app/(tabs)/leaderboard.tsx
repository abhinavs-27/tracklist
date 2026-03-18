import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import { MediaGrid, MediaItem } from "../../components/media/MediaGrid";
import {
  LeaderboardEntity,
  LeaderboardType,
  useLeaderboard,
} from "../../lib/hooks/useLeaderboard";
import { ViewToggle } from "../../components/ui/ViewToggle";

export default function LeaderboardScreen() {
  const router = useRouter();
  const [entity, setEntity] = useState<LeaderboardEntity>("album");
  const [type, setType] = useState<LeaderboardType>("popular");

  const { data, isLoading } = useLeaderboard(type, {}, entity);

  const mediaItems: MediaItem[] =
    data?.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      artworkUrl: item.artworkUrl,
      rank: item.rank,
    })) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
          gap: 12,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            color: "#111827",
          }}
        >
          Leaderboard
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <ViewToggle
              value={entity}
              onChange={(val) => setEntity(val as LeaderboardEntity)}
              options={[
                { value: "album", label: "Albums" },
                { value: "song", label: "Songs" },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ViewToggle
              value={type}
              onChange={(val) => setType(val as LeaderboardType)}
              options={[
                { value: "popular", label: "Popular" },
                { value: "topRated", label: "Top Rated" },
              ]}
            />
          </View>
        </View>
      </View>

      {isLoading ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="small" color="#111827" />
        </View>
      ) : (
        <MediaGrid
          data={mediaItems}
          numColumns={2}
          onPressItem={(item) => {
            const base = entity === "album" ? "/album" : "/song";
            router.push(`${base}/${item.id}` as const);
          }}
        />
      )}
    </SafeAreaView>
  );
}

