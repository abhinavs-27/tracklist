import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLeaderboard } from "../../lib/hooks/useLeaderboard";
import { MediaGrid } from "../../components/media/MediaGrid";

export default function HomeScreen() {
  const { data, isLoading } = useLeaderboard("popular", {}, "album");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
      >
        <View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: "#111827",
              marginBottom: 4,
            }}
          >
            Discover
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280" }}>
            Trending albums from the Tracklist community.
          </Text>
        </View>

        {isLoading ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 40,
            }}
          >
            <ActivityIndicator size="small" color="#111827" />
          </View>
        ) : (
          <MediaGrid
            data={
              data?.map((item) => ({
                id: item.id,
                title: item.title,
                artist: item.artist,
                artworkUrl: item.artworkUrl,
                rank: item.rank,
              })) ?? []
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

