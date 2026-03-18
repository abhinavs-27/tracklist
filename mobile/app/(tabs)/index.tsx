import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { useLeaderboard } from "../../lib/hooks/useLeaderboard";
import { useRisingArtists } from "../../lib/hooks/useDiscover";
import { MediaGrid } from "../../components/media/MediaGrid";
import { useRouter } from "expo-router";
import { Artwork } from "../../components/media/Artwork";

export default function HomeScreen() {
  const router = useRouter();
  const { data: popularAlbums, isLoading: isLoadingPopular } = useLeaderboard({
    type: "albums",
    metric: "popular",
  });
  const { data: topRatedAlbums, isLoading: isLoadingTopRated } = useLeaderboard({
    type: "albums",
    metric: "top_rated",
  });
  const { data: risingArtists, isLoading: isLoadingRising } = useRisingArtists(10);

  const isLoading = isLoadingPopular || isLoadingTopRated || isLoadingRising;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }} // Space for tab bar
      >
        <View style={{ padding: 16, gap: 4 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "700",
              color: "#f4f4f5",
            }}
          >
            Discover
          </Text>
          <Text style={{ fontSize: 14, color: "#a1a1aa" }}>
            Trending music from the Tracklist community.
          </Text>
        </View>

        {isLoading ? (
          <View
            style={{
              paddingVertical: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="small" color="#10b981" />
          </View>
        ) : (
          <View style={{ gap: 32, marginTop: 16 }}>
            {/* Popular Albums */}
            <View style={{ gap: 12 }}>
              <View style={{ paddingHorizontal: 16 }}>
                <Text
                  style={{ fontSize: 18, fontWeight: "600", color: "#f4f4f5" }}
                >
                  Trending Albums
                </Text>
              </View>
              <MediaGrid
                data={
                  popularAlbums?.slice(0, 4).map((item) => ({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    artworkUrl: item.artworkUrl,
                  })) ?? []
                }
                scrollEnabled={false}
                onPressItem={(item) => router.push(`/album/${item.id}`)}
              />
            </View>

            {/* Rising Artists */}
            {risingArtists && risingArtists.length > 0 && (
              <View style={{ gap: 12 }}>
                <View style={{ paddingHorizontal: 16 }}>
                  <Text
                    style={{ fontSize: 18, fontWeight: "600", color: "#f4f4f5" }}
                  >
                    Rising Artists
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
                >
                  {risingArtists.map((artist: any) => (
                    <TouchableOpacity
                      key={artist.artist_id}
                      style={{ alignItems: "center", width: 100 }}
                    >
                      <Artwork src={artist.avatar_url} size="md" />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: "#f4f4f5",
                          fontSize: 12,
                          fontWeight: "500",
                          marginTop: 8,
                          textAlign: "center",
                        }}
                      >
                        {artist.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Top Rated Albums */}
            <View style={{ gap: 12 }}>
              <View style={{ paddingHorizontal: 16 }}>
                <Text
                  style={{ fontSize: 18, fontWeight: "600", color: "#f4f4f5" }}
                >
                  Top Rated
                </Text>
              </View>
              <MediaGrid
                data={
                  topRatedAlbums?.slice(0, 4).map((item) => ({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    artworkUrl: item.artworkUrl,
                  })) ?? []
                }
                scrollEnabled={false}
                onPressItem={(item) => router.push(`/album/${item.id}`)}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
