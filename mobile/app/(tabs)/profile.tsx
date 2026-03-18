import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { fetcher } from "../../lib/api";
import { useQuery } from "@tanstack/react-query";
import { MediaGrid, MediaItem } from "../../components/media/MediaGrid";

type ProfileResponse = {
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  favorites: MediaItem[];
  recent: MediaItem[];
};

export default function ProfileScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetcher<ProfileResponse>("/api/profile"),
    staleTime: 30 * 1000,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
      >
        {isLoading || !data ? (
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
          <>
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: "#111827",
                }}
              >
                {data.user.username}
              </Text>
              <Text style={{ fontSize: 13, color: "#6B7280" }}>
                Favorites and recent activity
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                Favorites
              </Text>
              <MediaGrid data={data.favorites ?? []} numColumns={2} />
            </View>

            <View style={{ gap: 12 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                Recent activity
              </Text>
              <MediaGrid data={data.recent ?? []} numColumns={2} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

