import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/time";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SkeletonBox, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { theme } from "@/lib/theme";
import { useSong, type RecentListenItem, type RecommendedTrack } from "@/lib/hooks/useSong";
import { useAuth } from "@/lib/hooks/useAuth";
import { useSongLeaderboard } from "@/lib/hooks/useFriendLeaderboard";
import { FriendLeaderboard } from "@/components/social/FriendLeaderboard";
import { MediaGrid } from "@/components/media/MediaGrid";
import { StatRow } from "@/components/media/StatRow";
import { ReviewList } from "@/components/reviews/ReviewList";
import { RatingSection } from "@/components/reviews/RatingSection";
import { queryKeys } from "@/lib/query-keys";
import { SongInfoTab } from "@/components/info-tab/SongInfoTab";

type Tab = "reviews" | "info" | "recommended" | "social";

const CHART_STEPS = [1, 2, 3, 4, 5];
const CHART_MAX_H = 56;

function RatingChart({ distribution }: { distribution: Record<string, number> }) {
  const counts = CHART_STEPS.map((s) => (distribution[String(s - 0.5)] ?? 0) + (distribution[String(s)] ?? 0));
  const max = Math.max(...counts, 1);
  return (
    <View style={chart.wrap}>
      {CHART_STEPS.map((step, i) => {
        const h = Math.max(Math.round((counts[i] / max) * CHART_MAX_H), 2);
        return (
          <View key={step} style={chart.col}>
            <View style={[chart.bar, { height: h }]} />
            <Text style={chart.label}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

function formatDurationMs(ms: number | null) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const loggedIn = !!session?.access_token;
  const [activeTab, setActiveTab] = useState<Tab>("reviews");
  const queryClient = useQueryClient();

  const songId = useMemo(() => (Array.isArray(id) ? id[0] : id) ?? "", [id]);
  const { song, stats, reviews, myReview, reviewStats, recentListens, recommended, isLoading, error } = useSong(songId);
  const { data: leaderboard = [] } = useSongLeaderboard(songId, loggedIn);

  const invalidateSong = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.song(songId) });
  };

  if (isLoading) {
    return (
      <SkeletonScreen>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {/* Nav */}
          <View style={s.nav}>
            <Pressable onPress={() => router.back()} hitSlop={16}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
            </Pressable>
            <SkeletonLine width="50%" style={{ marginHorizontal: 12 }} />
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, alignItems: "center", gap: 20 }} scrollEnabled={false}>
            {/* Artwork */}
            <SkeletonBox width={224} height={224} radius={12} />
            {/* Title / artist / album */}
            <View style={{ width: "100%", alignItems: "center", gap: 10 }}>
              <SkeletonLine width="55%" />
              <SkeletonLine width="38%" />
              <SkeletonLine width="44%" />
            </View>
            {/* Stats */}
            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              {[0, 1, 2, 3].map((i) => <SkeletonBox key={i} height={48} radius={10} style={{ flex: 1 }} />)}
            </View>
            {/* Tab bar */}
            <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
              {[0, 1].map((i) => <SkeletonBox key={i} width={80} height={32} radius={16} />)}
            </View>
            {/* Review rows */}
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: "100%", backgroundColor: theme.colors.panel, borderRadius: 12, padding: 14, gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <SkeletonBox width={36} height={36} radius={18} />
                  <SkeletonLine width="35%" />
                </View>
                <SkeletonLine width="90%" />
                <SkeletonLine width="70%" />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SkeletonScreen>
    );
  }

  if (error || !song) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Failed to load song</Text>
      </SafeAreaView>
    );
  }

  const duration = formatDurationMs(song.duration_ms);
  const year = song.release_date ? new Date(song.release_date).getFullYear() : null;
  const tabs: { id: Tab; label: string }[] = [
    { id: "reviews", label: "Reviews" },
    { id: "info", label: "Info" },
    ...(recommended.length > 0 ? [{ id: "recommended" as Tab, label: "Recommended" }] : []),
    ...(loggedIn ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];

  return (
    <SafeAreaView style={s.safe}>
      {/* Nav bar — matches album page */}
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
        </Pressable>
        <Text style={s.navTitle} numberOfLines={1}>{song.name}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero — album art centered, same size as album/artist page (224px) */}
        <View style={s.artWrap}>
          {song.image_url
            ? <Image source={{ uri: song.image_url }} style={s.art} contentFit="cover" />
            : <View style={[s.art, s.artPlaceholder]}><Text style={s.artGlyph}>♪</Text></View>}
        </View>

        {/* Metadata */}
        <View style={s.meta}>
          <Text style={s.label}>Song</Text>
          <Text style={s.title}>{song.name}</Text>
          <Pressable onPress={song.artist_id ? () => router.push(`/artist/${song.artist_id}` as const) : undefined}>
            <Text style={s.artist}>{song.artist}</Text>
          </Pressable>
          {song.album_name && (
            <Pressable onPress={song.album_id ? () => router.push(`/album/${song.album_id}` as const) : undefined}>
              <Text style={s.albumLink}>From <Text style={s.albumLinkName}>{song.album_name}</Text></Text>
            </Pressable>
          )}
          {(duration || year) && (
            <Text style={s.detail}>
              {[duration, year].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>

        {/* Stats */}
        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
          centered
        />

        {/* Rating distribution chart */}
        {stats.rating_distribution && stats.review_count > 0 && (
          <RatingChart distribution={stats.rating_distribution} />
        )}

        {/* Your rating strip — shown outside Reviews tab */}
        {myReview && activeTab !== "reviews" && (
          <View style={s.yourRating}>
            <Text style={s.yourRatingText}>
              Your rating: <Text style={s.yourRatingStars}>
                {"★".repeat(Math.floor(myReview.rating))}{myReview.rating % 1 !== 0 ? "½" : ""}
              </Text>
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View style={s.tabBar}>
          {tabs.map((t) => (
            <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={s.tabBtn}>
              <Text style={[s.tabLabel, activeTab === t.id && s.tabLabelActive]}>{t.label}</Text>
              {activeTab === t.id && <View style={s.tabLine} />}
            </Pressable>
          ))}
        </View>

        {/* Reviews tab */}
        {activeTab === "reviews" && (
          <View style={s.tabContent}>
            {loggedIn && song.id && (
              <RatingSection
                albumId={song.id}
                reviewId={myReview?.id}
                myReview={myReview ?? null}
                onReviewChange={invalidateSong}
              />
            )}
            <ReviewList
              reviews={reviews}
              averageRating={reviewStats?.average_rating ?? stats.average_rating}
              reviewCount={reviewStats?.count ?? stats.review_count}
              onViewAllPress={() => router.push(`/reviews/song/${song.canonical_id}` as const)}
            />
          </View>
        )}

        {/* Info tab */}
        {activeTab === "info" && song && (
          <View style={s.tabContent}>
            <SongInfoTab
              producers={(song as any).producers ?? []}
              songwriters={(song as any).songwriters ?? []}
              featuring={(song as any).featuring ?? []}
              samples={(song as any).samples ?? []}
              sampledBy={(song as any).sampled_by ?? []}
              covers={(song as any).covers ?? []}
            />
          </View>
        )}

        {/* Recommended tab — 2-col media grid matching web */}
        {activeTab === "recommended" && recommended.length > 0 && (
          <View style={s.tabContent}>
            <MediaGrid
              data={recommended.map((t: RecommendedTrack) => ({
                id: t.canonical_id,
                title: t.name,
                artist: t.artist,
                artworkUrl: t.image_url,
              }))}
              numColumns={2}
              scrollEnabled={false}
              onPressItem={(item) => router.push(`/song/${item.id}` as const)}
            />
          </View>
        )}

        {/* Social tab */}
        {activeTab === "social" && loggedIn && (
          <View style={s.tabContent}>
            <FriendLeaderboard entries={leaderboard} />
            <View style={s.socialSection}>
              <Text style={s.sectionTitle}>Recently played</Text>
              {recentListens.length > 0 ? (
                recentListens.map((l: RecentListenItem) => (
                  <View key={`${l.user_id}-${l.listened_at}`} style={s.activityRow}>
                    {/* Album art thumbnail — left */}
                    {song.image_url
                      ? <Image source={{ uri: song.image_url }} style={s.activityAlbumThumb} contentFit="cover" />
                      : <View style={[s.activityAlbumThumb, s.activityAvatarFallback]} />}
                    {/* Text */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.activityText} numberOfLines={1}>
                        <Text style={s.activityUsername}>{l.username}</Text>
                        <Text style={s.activityMuted}> played this</Text>
                      </Text>
                      <Text style={s.activityTime}>{formatRelativeTime(l.listened_at)}</Text>
                    </View>
                    {/* User avatar — right */}
                    {l.avatar_url
                      ? <Image source={{ uri: l.avatar_url }} style={s.activityAvatar} contentFit="cover" />
                      : <View style={[s.activityAvatar, s.activityAvatarFallback]}>
                          <Text style={s.activityAvatarLetter}>{l.username[0]?.toUpperCase()}</Text>
                        </View>}
                  </View>
                ))
              ) : (
                <Text style={s.activityText}>No recent plays from your network.</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const chart = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: CHART_MAX_H + 14 },
  col: { flex: 1, alignItems: "center", gap: 2 },
  bar: { width: "100%", borderRadius: 2, backgroundColor: "rgba(245,158,11,0.4)" },
  label: { fontSize: 11, color: theme.colors.muted, textAlign: "center" },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  nav: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: "900", color: theme.colors.text, textAlign: "center" },
  scroll: { padding: 16, gap: 20, paddingBottom: 100 },
  // Hero art — 224px, no label (web puts it above title)
  artWrap: {
    alignSelf: "center",
    width: 224, height: 224, borderRadius: 16, overflow: "hidden",
    backgroundColor: theme.colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.85, shadowRadius: 30, elevation: 12,
  },
  art: { width: "100%", height: "100%" },
  artPlaceholder: { alignItems: "center", justifyContent: "center" },
  artGlyph: { fontSize: 48, color: theme.colors.muted },
  // Metadata below art
  meta: { alignItems: "center", gap: 4 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.muted },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.text, textAlign: "center", letterSpacing: -0.3 },
  artist: { fontSize: 16, fontWeight: "600", color: "#d4d4d8", textAlign: "center" },
  albumLink: { fontSize: 14, color: theme.colors.muted, textAlign: "center" },
  albumLinkName: { color: "#a1a1aa", textDecorationLine: "underline" },
  detail: { fontSize: 12, color: theme.colors.muted, textAlign: "center" },
  // Your rating strip
  yourRating: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    backgroundColor: "rgba(24,24,27,0.6)", paddingHorizontal: 14, paddingVertical: 12,
  },
  yourRatingText: { fontSize: 14, color: theme.colors.muted },
  yourRatingStars: { color: "#fbbf24", fontWeight: "600" },
  // Tabs
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, marginHorizontal: -16, paddingHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabLabelActive: { color: theme.colors.text },
  tabLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: theme.colors.gold },
  tabContent: { gap: 16, paddingTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  // Social recently played
  socialSection: { gap: 10 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: "rgba(24,24,27,0.4)", paddingHorizontal: 12, paddingVertical: 10 },
  activityAlbumThumb: { width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  activityAvatar: { width: 28, height: 28, borderRadius: 14, overflow: "hidden", flexShrink: 0 },
  activityAvatarFallback: { backgroundColor: theme.colors.active, alignItems: "center", justifyContent: "center" },
  activityAvatarLetter: { fontSize: 10, fontWeight: "700", color: theme.colors.muted },
  activityText: { fontSize: 13 },
  activityUsername: { fontWeight: "700", color: theme.colors.text },
  activityMuted: { color: theme.colors.muted },
  activityTime: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
});
