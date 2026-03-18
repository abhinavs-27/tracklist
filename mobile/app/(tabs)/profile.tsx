import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from "react-native";
import { fetcher } from "../../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MediaGrid, MediaItem } from "../../components/media/MediaGrid";
import { useRouter } from "expo-router";
import { useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import { Artwork } from "../../components/media/Artwork";

type ProfileResponse = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  is_own_profile: boolean;
};

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const user = await fetcher<ProfileResponse>("/api/users/me");
      // Fetch full profile to get counts
      const fullProfile = await fetcher<ProfileResponse>(
        `/api/users/${user.username}`,
      );

      const [favorites, recent] = await Promise.all([
        fetcher<any[]>(`/api/users/me/favorites`).catch(() => []),
        fetcher<{ albums: any[] }>(
          `/api/recent-albums?user_id=${user.id}`,
        ).catch(() => ({ albums: [] })),
      ]);

      return {
        user: fullProfile,
        favorites: Array.isArray(favorites) ? favorites : [],
        recent: recent.albums || [],
      };
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
      Alert.alert(
        "Error",
        "Failed to sync Spotify. Is your account connected?",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  if (error) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#09090b",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#ef4444" }}>Error loading profile</Text>
      </SafeAreaView>
    );
  }

  const favorites: MediaItem[] =
    data?.favorites.map((f: any) => ({
      id: f.album_id,
      title: f.name,
      artist: "", // Favorites API doesn't seem to return artist name directly in the list
      artworkUrl: f.image_url,
    })) ?? [];

  const recent: MediaItem[] =
    data?.recent.map((r: any) => ({
      id: r.album_id,
      title: r.album_name,
      artist: r.artist_name,
      artworkUrl: r.album_image,
    })) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090b" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 100 }}
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
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Artwork src={data.user.avatar_url} size="lg" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "700",
                      color: "#f4f4f5",
                    }}
                  >
                    {data.user.username}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <Text style={{ color: "#f4f4f5", fontWeight: "600" }}>
                        {data.user.followers_count}
                      </Text>
                      <Text style={{ color: "#a1a1aa" }}>Followers</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <Text style={{ color: "#f4f4f5", fontWeight: "600" }}>
                        {data.user.following_count}
                      </Text>
                      <Text style={{ color: "#a1a1aa" }}>Following</Text>
                    </View>
                  </View>
                </View>
              </View>

              {data.user.bio && (
                <Text style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 20 }}>
                  {data.user.bio}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    /* Navigate to settings or edit profile */
                  }}
                  style={{
                    flex: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: "#27272a",
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ color: "#f4f4f5", fontSize: 14, fontWeight: "600" }}
                  >
                    Edit Profile
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSyncSpotify}
                  disabled={isSyncing}
                  style={{
                    flex: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: "#10b981",
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text
                      style={{ color: "#ffffff", fontSize: 14, fontWeight: "600" }}
                    >
                      Sync Spotify
                    </Text>
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
              {favorites.length > 0 ? (
                <MediaGrid
                  data={favorites}
                  numColumns={2}
                  scrollEnabled={false}
                  onPressItem={(item) => router.push(`/album/${item.id}`)}
                />
              ) : (
                <Text style={{ color: "#71717a", fontSize: 14 }}>
                  No favorites yet.
                </Text>
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
              {recent.length > 0 ? (
                <MediaGrid
                  data={recent}
                  numColumns={2}
                  scrollEnabled={false}
                  onPressItem={(item) => router.push(`/album/${item.id}`)}
                />
              ) : (
                <Text style={{ color: "#71717a", fontSize: 14 }}>
                  No recent activity.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
