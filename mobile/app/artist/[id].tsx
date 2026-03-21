import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";
import { useArtist } from "../../lib/hooks/useArtist";
import { ActionRow } from "../../components/media/ActionRow";
import { MediaHeader } from "../../components/media/MediaHeader";
import { StatRow } from "../../components/media/StatRow";
import { TopTracks } from "../../components/media/TopTracks";
import { MediaGrid, type MediaItem } from "../../components/media/MediaGrid";
import { useLogging } from "../../lib/logging-context";
import { useRecentViews } from "../../lib/recent-views-context";

function formatFollowers(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M followers`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K followers`;
  }
  return `${n.toLocaleString()} followers`;
}

function artistDetailLine(
  followers: number | null,
  genres: string[] | undefined,
): string | null {
  const parts: string[] = [];
  const f = formatFollowers(followers);
  if (f) parts.push(f);
  if (genres?.length) parts.push(genres.join(", "));
  return parts.length ? parts.join(" · ") : null;
}

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const artistId = useMemo(() => {
    if (!id) return "";
    return Array.isArray(id) ? id[0] : id;
  }, [id]);

  const { artist, albums, topTracks, stats, isLoading, error } =
    useArtist(artistId);
  const { recordView } = useRecentViews();
  const { logListen, showToast } = useLogging();

  const topTrackId = topTracks[0]?.id;
  useEffect(() => {
    if (!artist || !topTrackId) return;
    void recordView({
      kind: "artist",
      id: artist.id,
      title: artist.name,
      subtitle: artist.genres?.length ? artist.genres.join(", ") : "Artist",
      artworkUrl: artist.image_url,
      trackId: topTrackId,
      artistId: artist.id,
    });
  }, [artist?.id, topTrackId, recordView]);

  if (isLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </SafeAreaView>
    );
  }

  if (error || !artist) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>
          Failed to load artist
        </Text>
        {error instanceof Error && (
          <Text
            style={{
              marginTop: 8,
              color: theme.colors.muted,
              textAlign: "center",
            }}
          >
            {error.message}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  const detailLine = artistDetailLine(artist.followers, artist.genres);
  const gridItems: MediaItem[] = albums.map((a) => ({
    id: a.id,
    title: a.name,
    artist: a.artist,
    artworkUrl: a.artwork_url,
  }));

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
          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
            ‹ Back
          </Text>
        </Pressable>
        <Text
          style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}
          numberOfLines={1}
        >
          Artist
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 100 }}
      >
        <MediaHeader
          artworkUrl={artist.image_url}
          title={artist.name}
          subtitle="Artist"
          detailLine={detailLine}
        />

        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        <ActionRow
          logLabel="Log this listen"
          onLogPress={() => {
            const t = topTracks[0];
            if (!t) {
              showToast("No popular tracks to log yet.");
              return;
            }
            void logListen({
              trackId: t.id,
              artistId: artist.id,
              source: "manual",
              displayName: artist.name,
            }).catch(() => showToast("Couldn’t log. Try again."));
          }}
        />

        <TopTracks
          title="Popular tracks"
          tracks={topTracks}
          onPressTrack={(trackId) =>
            router.push(`/song/${trackId}` as const)
          }
        />

        <View style={{ gap: 12 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: theme.colors.text,
            }}
          >
            Albums
          </Text>
          {gridItems.length === 0 ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
              No albums listed.
            </Text>
          ) : (
            <MediaGrid
              data={gridItems}
              numColumns={2}
              scrollEnabled={false}
              onPressItem={(item) =>
                router.push(`/album/${item.id}` as const)
              }
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
