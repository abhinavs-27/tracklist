import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { useAlbum } from "@/lib/hooks/useAlbum";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAlbumLeaderboard } from "@/lib/hooks/useFriendLeaderboard";
import { FriendLeaderboard } from "@/components/social/FriendLeaderboard";
import { AlbumHeader } from "@/components/media/AlbumHeader";
import { StatRow } from "@/components/media/StatRow";
import { ActionRow } from "@/components/media/ActionRow";
import { Tracklist } from "@/components/media/Tracklist";
import { ReviewList } from "@/components/reviews/ReviewList";

type Tab = "info" | "social";

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const loggedIn = !!session?.access_token;
  const [activeTab, setActiveTab] = useState<Tab>("info");

  const albumId = useMemo(() => {
    if (!id) return "";
    return Array.isArray(id) ? id[0] : id;
  }, [id]);

  const { album, tracks, stats, reviews, isLoading, error } = useAlbum(albumId);
  const { data: leaderboard = [] } = useAlbumLeaderboard(albumId, loggedIn);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error || !album) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>
          Failed to load album
        </Text>
        {error instanceof Error && (
          <Text style={{ marginTop: 8, color: theme.colors.muted, textAlign: "center" }}>
            {error.message}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  const showSocialTab = loggedIn && leaderboard.length >= 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
        <Text
          style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16, flex: 1 }}
          numberOfLines={1}
        >
          {album.name}
        </Text>
      </View>

      {showSocialTab && (
        <View style={albumStyles.tabBar}>
          {(["info", "social"] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setActiveTab(t)} style={albumStyles.tabBtn}>
              <Text style={[albumStyles.tabLabel, activeTab === t && albumStyles.tabLabelActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
              {activeTab === t && <View style={albumStyles.tabIndicator} />}
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 100 }}>
        <AlbumHeader
          artworkUrl={album.artwork_url}
          title={album.name}
          artist={album.artist}
          releaseDate={album.release_date}
          artistId={album.artist_id}
          onPressArtist={(aid) => router.push(`/artist/${aid}` as const)}
        />

        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        <ActionRow
          onReviewPress={() => router.push(`/reviews/album/${album.id}` as const)}
        />

        {/* Info tab */}
        {(activeTab === "info" || !showSocialTab) && (
          <>
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
                Tracklist
              </Text>
              <Tracklist
                tracks={tracks}
                onPressTrack={(trackId) => router.push(`/song/${trackId}` as const)}
              />
            </View>

            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
                Reviews
              </Text>
              <ReviewList
                reviews={reviews}
                onViewAllPress={() => router.push(`/reviews/album/${album.id}` as const)}
              />
            </View>
          </>
        )}

        {/* Social tab */}
        {activeTab === "social" && showSocialTab && (
          <FriendLeaderboard entries={leaderboard} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const albumStyles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabLabelActive: { color: theme.colors.text },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.emerald,
  },
});
