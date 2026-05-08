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
import { Tracklist } from "@/components/media/Tracklist";
import { ReviewList } from "@/components/reviews/ReviewList";

// Half-star rating steps — mirrors web's HALF_STAR_RATINGS
const HALF_STAR_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const CHART_MAX_H = 28; // px, matches web's 28px max bar height

function RatingChart({ distribution }: { distribution: Record<string, number> }) {
  const counts = HALF_STAR_STEPS.map((s) => distribution[String(s)] ?? 0);
  const max = Math.max(...counts, 1);
  return (
    <View style={chart.wrap}>
      {HALF_STAR_STEPS.map((step, i) => {
        const h = Math.max(max > 0 ? Math.round((counts[i] / max) * CHART_MAX_H) : 0, 2);
        return (
          <View key={step} style={chart.col}>
            <View style={[chart.bar, { height: h }]} />
            <Text style={chart.label}>{step % 1 === 0 ? String(step) : ""}</Text>
          </View>
        );
      })}
    </View>
  );
}

const chart = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: CHART_MAX_H + 14,
    marginTop: 6,
  },
  col: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  bar: {
    width: "100%",
    borderRadius: 2,
    backgroundColor: "rgba(245,158,11,0.4)",
  },
  label: {
    fontSize: 8,
    color: theme.colors.muted,
    textAlign: "center",
  },
});

type Tab = "tracks" | "reviews" | "social";

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const loggedIn = !!session?.access_token;
  const [activeTab, setActiveTab] = useState<Tab>("tracks");

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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Failed to load album</Text>
        {error instanceof Error && (
          <Text style={{ marginTop: 8, color: theme.colors.muted, textAlign: "center" }}>{error.message}</Text>
        )}
      </SafeAreaView>
    );
  }

  const totalDurationMs = tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0);
  const tabs: { id: Tab; label: string }[] = [
    { id: "tracks", label: "Tracks" },
    { id: "reviews", label: "Reviews" },
    ...(loggedIn ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];

  return (
    <SafeAreaView style={s.safe}>
      {/* Nav bar */}
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
        <Text style={s.navTitle} numberOfLines={1}>{album.name}</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Everything scrolls together — tabs sit below the hero, matching web */}
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <AlbumHeader
          artworkUrl={album.artwork_url}
          title={album.name}
          artist={album.artist}
          releaseDate={album.release_date}
          artistId={album.artist_id}
          onPressArtist={(aid) => router.push(`/artist/${aid}` as const)}
          trackCount={tracks.length || undefined}
          totalDurationMs={totalDurationMs || undefined}
        />

        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        {/* Rating distribution chart — mirrors web bar chart */}
        {stats.rating_distribution && stats.review_count > 0 && (
          <RatingChart distribution={stats.rating_distribution} />
        )}

        {/* Tab bar — inside scroll, below hero (same as web) */}
        <View style={s.tabBar}>
          {tabs.map((t) => (
            <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={s.tabBtn}>
              <Text style={[s.tabLabel, activeTab === t.id && s.tabLabelActive]}>
                {t.label}
              </Text>
              {activeTab === t.id && <View style={s.tabLine} />}
            </Pressable>
          ))}
        </View>

        {/* Tab content */}
        {activeTab === "tracks" && (
          <Tracklist
            tracks={tracks.map((t) => ({ ...t, artist: album.artist }))}
            onPressTrack={(tid) => router.push(`/song/${tid}` as const)}
          />
        )}

        {activeTab === "reviews" && (
          <ReviewList
            reviews={reviews}
            onViewAllPress={() => router.push(`/reviews/album/${album.id}` as const)}
          />
        )}

        {activeTab === "social" && loggedIn && (
          <FriendLeaderboard entries={leaderboard} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  navTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: theme.colors.text,
    textAlign: "center",
  },
  scroll: {
    padding: 16,
    gap: 16,
    paddingBottom: 100,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  tabLabelActive: {
    color: theme.colors.text,
  },
  tabLine: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.emerald,
  },
});
