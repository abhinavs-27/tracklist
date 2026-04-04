import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";
import { useSong } from "@/lib/hooks/useSong";
import { MediaHeader } from "@/components/media/MediaHeader";
import { StatRow } from "@/components/media/StatRow";
import { ActionRow } from "@/components/media/ActionRow";
import { SongContext } from "@/components/media/SongContext";
import { ReviewList } from "@/components/reviews/ReviewList";

function detailLineForSong(
  albumName: string | null,
  releaseDate: string | null,
): string | null {
  const parts: string[] = [];
  if (albumName) parts.push(albumName);
  if (releaseDate) {
    const d = new Date(releaseDate);
    const y = Number.isNaN(d.getTime()) ? null : d.getFullYear();
    if (y != null) parts.push(String(y));
  }
  return parts.length ? parts.join(" · ") : null;
}

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const songId = useMemo(() => {
    if (!id) return "";
    return Array.isArray(id) ? id[0] : id;
  }, [id]);

  const { song, album, stats, reviews, isLoading, error } = useSong(songId);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error || !song) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>
          Failed to load song
        </Text>
        {error instanceof Error && (
          <Text style={{ marginTop: 8, color: theme.colors.muted, textAlign: "center" }}>
            {error.message}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  const detailLine = detailLineForSong(song.album_name, song.release_date);

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
          Song
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 100 }}>
        <MediaHeader
          artworkUrl={song.image_url}
          title={song.name}
          subtitle={song.artist}
          detailLine={detailLine}
          onPressSubtitle={
            song.artist_id
              ? () => router.push(`/artist/${song.artist_id}` as const)
              : undefined
          }
        />

        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        <ActionRow
          onReviewPress={() => router.push(`/reviews/song/${song.id}` as const)}
        />

        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
            Album
          </Text>
          <SongContext
            album={album}
            onPressAlbum={(albumId) => router.push(`/album/${albumId}` as const)}
          />
        </View>

        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text }}>
            Reviews
          </Text>
          <ReviewList
            reviews={reviews}
            onViewAllPress={() => router.push(`/reviews/song/${song.id}` as const)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
