import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { useArtistAllAlbums, type ArtistAlbumItem } from "@/lib/hooks/useArtist";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";

export default function ArtistAlbumsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const artistId = useMemo(() => (Array.isArray(id) ? id[0] : id) ?? "", [id]);

  const { data, isPending, error } = useArtistAllAlbums(artistId);

  const grid: MediaItem[] = (data?.albums ?? []).map((a: ArtistAlbumItem) => ({
    id: a.id,
    title: a.name,
    artist: a.artist,
    artworkUrl: a.artwork_url,
    avgRating: a.average_rating ?? undefined,
    totalPlays: a.listen_count,
  }));

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.navTitle} numberOfLines={1}>Albums</Text>
          {data?.artistName ? (
            <Text style={s.navSubtitle} numberOfLines={1}>{data.artistName}</Text>
          ) : null}
        </View>
        <View style={{ width: 26 }} />
      </View>

      {isPending ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={theme.colors.gold} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Failed to load albums</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {grid.length > 0 ? (
            <MediaGrid
              data={grid}
              numColumns={3}
              scrollEnabled={false}
              showArtist={false}
              onPressItem={(item) => router.push(`/album/${item.id}` as const)}
            />
          ) : (
            <Text style={s.empty}>No albums in catalog yet.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  navTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  navSubtitle: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  empty: { fontSize: 14, color: theme.colors.muted, textAlign: "center", marginTop: 40 },
});
