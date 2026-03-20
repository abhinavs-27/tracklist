import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { theme } from "../../lib/theme";
import { useAlbum } from "../../lib/hooks/useAlbum";
import { AlbumHeader } from "../../components/media/AlbumHeader";
import { StatRow } from "../../components/media/StatRow";
import { ActionRow } from "../../components/media/ActionRow";
import { Tracklist } from "../../components/media/Tracklist";
import { ReviewList } from "../../components/reviews/ReviewList";
import { LogModal } from "../../components/media/LogModal";
import { queryKeys } from "../../lib/query-keys";

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const albumId = useMemo(() => {
    if (!id) return "";
    return Array.isArray(id) ? id[0] : id;
  }, [id]);

  const { album, tracks, stats, reviews, isLoading, error } = useAlbum(albumId);
  const [isLogModalVisible, setIsLogModalVisible] = useState(false);

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
          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>‹ Back</Text>
        </Pressable>
        <Text
          style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}
          numberOfLines={1}
        >
          Album
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 100 }}>
        {/* 1. Album header */}
        <AlbumHeader
          artworkUrl={album.artwork_url}
          title={album.name}
          artist={album.artist}
          releaseDate={album.release_date}
        />

        {/* 2. Stats row */}
        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        {/* 3. Action row */}
        <ActionRow onReviewPress={() => setIsLogModalVisible(true)} />

        {/* 4. Tracklist */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
            Tracklist
          </Text>
          <Tracklist
            tracks={tracks}
            onPressTrack={(trackId) => router.push(`/song/${trackId}` as const)}
          />
        </View>

        {/* 5. Reviews */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
            Reviews
          </Text>
          <ReviewList
            reviews={reviews}
            onViewAllPress={() => router.push(`/reviews/album/${album.id}` as const)}
          />
        </View>
      </ScrollView>

      <LogModal
        visible={isLogModalVisible}
        onClose={() => setIsLogModalVisible(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.album(albumId) });
        }}
        entityId={album.id}
        entityType="album"
        entityName={album.name}
      />
    </SafeAreaView>
  );
}
