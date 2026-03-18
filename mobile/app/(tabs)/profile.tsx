import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, Text, View, TouchableOpacity, Alert } from "react-native";
import { fetcher } from "../../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MediaGrid, MediaItem } from "../../components/media/MediaGrid";
import { useRouter } from "expo-router";
import { useState } from "react";
import { queryKeys } from "../../lib/query-keys";

type ProfileResponse = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const user = await fetcher<ProfileResponse>("/api/users/me");
      try {
        const stats = await fetcher<{ favorites: MediaItem[], recent: MediaItem[] }>(`/api/users/${user.username}/profile-data`);
        return { user, favorites: stats.favorites, recent: stats.recent };
      } catch {
         return { user, favorites: [], recent: [] };
      }
    },
    staleTime: 30 * 1000,
  });

  async function handleSyncSpotify() {
    setIsSyncing(true);
    try {
      await fetcher("/api/spotify/sync", {
        method: "POST",
        body: JSON.stringify({ mode: "both" }),
      });
      Alert.alert("Success", "Spotify sync completed!");
      queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
    } catch (e) {
      Alert.alert("Error", "Failed to sync Spotify. Is your account connected?");
    } finally {
      setIsSyncing(false);
    }
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#ef4444" }}>Error loading profile</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
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
            <ActivityIndicator size="small" color="#10b981" />
          </View>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "700",
                  color: "#f4f4f5",
                }}
              >
                {data.user.username}
              </Text>
              {data.user.bio && (
                <Text style={{ fontSize: 14, color: "#a1a1aa" }}>
                  {data.user.bio}
                </Text>
              )}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                 <TouchableOpacity
                   onPress={() => { /* Navigate to settings or edit profile */ }}
                   style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#27272a", borderRadius: 8 }}
                 >
                   <Text style={{ color: "#f4f4f5", fontSize: 13, fontWeight: "500" }}>Edit Profile</Text>
                 </TouchableOpacity>
                 <TouchableOpacity
                   onPress={handleSyncSpotify}
                   disabled={isSyncing}
                   style={{
                     paddingHorizontal: 16,
                     paddingVertical: 8,
                     backgroundColor: "#10b981",
                     borderRadius: 8,
                     minWidth: 100,
                     alignItems: "center"
                   }}
                 >
                   {isSyncing ? (
                     <ActivityIndicator size="small" color="#ffffff" />
                   ) : (
                     <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "500" }}>Sync Spotify</Text>
                   )}
                 </TouchableOpacity>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#f4f4f5",
                }}
              >
                Favorites
              </Text>
              {data.favorites.length > 0 ? (
                <MediaGrid
                  data={data.favorites}
                  numColumns={2}
                  onPressItem={(item) => router.push(`/album/${item.id}`)}
                />
              ) : (
                <Text style={{ color: "#71717a", fontSize: 14 }}>No favorites yet.</Text>
              )}
            </View>

            <View style={{ gap: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: "#f4f4f5",
                }}
              >
                Recent activity
              </Text>
              {data.recent.length > 0 ? (
                <MediaGrid
                  data={data.recent}
                  numColumns={2}
                  onPressItem={(item) => router.push(`/album/${item.id}`)}
                />
              ) : (
                <Text style={{ color: "#71717a", fontSize: 14 }}>No recent activity.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
