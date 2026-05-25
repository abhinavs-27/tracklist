import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { SkeletonBox, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";
import { Ionicons } from "@expo/vector-icons";
import { formatRelativeTime } from "@/lib/time";
import { theme } from "@/lib/theme";
import { useAlbum, useAlbumSocialBundle } from "@/lib/hooks/useAlbum";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/hooks/useAuth";
import type { FriendActivityItem } from "@/lib/hooks/useFriendLeaderboard";
import { FriendLeaderboard } from "@/components/social/FriendLeaderboard";
import { AlbumHeader } from "@/components/media/AlbumHeader";
import { StatRow } from "@/components/media/StatRow";
import { Tracklist } from "@/components/media/Tracklist";
import { ReviewList } from "@/components/reviews/ReviewList";
import { RatingSection } from "@/components/reviews/RatingSection";
import { AlbumInfoTab } from "@/components/info-tab/AlbumInfoTab";

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
    fontSize: 11,
    color: theme.colors.muted,
    textAlign: "center",
  },
});

type Tab = "tracks" | "reviews" | "info" | "social";

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
  const { data: social } = useAlbumSocialBundle(albumId);
  const queryClient = useQueryClient();

  const myReview = social?.myReview ?? null;
  const leaderboard = social?.leaderboard ?? [];
  const friendActivity = social?.friendActivity ?? [];

  const invalidateAlbum = () => {
    queryClient.invalidateQueries({ queryKey: ["album-social-bundle", albumId] });
  };

  if (isLoading) {
    return (
      <SkeletonScreen>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {/* Nav */}
          <View style={s.nav}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
            </Pressable>
            <SkeletonLine width="50%" style={{ marginHorizontal: 12 }} />
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} scrollEnabled={false}>
            {/* Artwork */}
            <SkeletonBox width={220} height={220} radius={12} style={{ alignSelf: "center" }} />
            {/* Title + artist */}
            <View style={{ gap: 10, alignItems: "center" }}>
              <SkeletonLine width="65%" />
              <SkeletonLine width="40%" />
            </View>
            {/* Stats row */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[0, 1, 2, 3].map((i) => <SkeletonBox key={i} height={48} radius={10} style={{ flex: 1 }} />)}
            </View>
            {/* Tab bar */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {[0, 1, 2].map((i) => <SkeletonBox key={i} width={72} height={32} radius={16} />)}
            </View>
            {/* Track rows */}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <SkeletonBox width={16} height={14} radius={3} />
                <View style={{ flex: 1, gap: 6 }}>
                  <SkeletonLine width="70%" />
                  <SkeletonLine width="40%" />
                </View>
                <SkeletonLine width={36} />
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SkeletonScreen>
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
    { id: "info", label: "Info" },
    ...(loggedIn ? [{ id: "social" as Tab, label: "Social" }] : []),
  ];

  return (
    <SafeAreaView style={s.safe}>
      {/* Nav bar */}
      <View style={s.nav}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.gold} />
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
          showLabel={false}
        />

        <StatRow
          averageRating={stats.average_rating}
          totalPlays={stats.play_count}
          favoriteCount={stats.favorite_count}
          reviewCount={stats.review_count}
        />

        {/* Rating distribution chart */}
        {stats.rating_distribution && stats.review_count > 0 && (
          <RatingChart distribution={stats.rating_distribution} />
        )}

        {/* Your rating strip — shown outside Reviews tab for quick glance */}
        {myReview && activeTab !== "reviews" && (
          <View style={s.yourRating}>
            <Text style={s.yourRatingText}>
              Your rating: <Text style={s.yourRatingStars}>{"★".repeat(Math.floor(myReview.rating))}{myReview.rating % 1 !== 0 ? "½" : ""}</Text>
            </Text>
          </View>
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
            tracks={tracks.map((t) => ({ ...t, artist: null }))}
            onPressTrack={(tid) => router.push(`/song/${tid}` as const)}
          />
        )}

        {activeTab === "reviews" && (
          <View style={s.reviewsTab}>
            {loggedIn && album.id && (
              <RatingSection
                albumId={album.id}
                reviewId={myReview?.id}
                myReview={myReview ?? null}
                onReviewChange={invalidateAlbum}
              />
            )}
            <ReviewList
              reviews={reviews}
              averageRating={stats.average_rating}
              reviewCount={stats.review_count}
              onViewAllPress={() => router.push(`/reviews/album/${album.id}` as const)}
            />
          </View>
        )}

        {activeTab === "info" && album && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <AlbumInfoTab
              bio={(album as any).bio ?? null}
              producers={(album as any).producers ?? []}
              songwriters={(album as any).songwriters ?? []}
              labels={(album as any).labels ?? []}
            />
          </View>
        )}

        {activeTab === "social" && loggedIn && (
          <View style={s.socialContent}>
            <FriendLeaderboard entries={leaderboard} />
            <View style={s.socialSection}>
              <Text style={s.sectionTitle}>Recently listened</Text>
              {friendActivity.length > 0 ? (
                friendActivity.map((l: FriendActivityItem) => (
                  <View key={`${l.user_id}-${l.listened_at}`} style={s.activityRow}>
                    {l.avatar_url
                      ? <Image source={{ uri: l.avatar_url }} style={s.activityAvatar} contentFit="cover" />
                      : <View style={[s.activityAvatar, s.activityAvatarFallback]}>
                          <Text style={s.activityAvatarLetter}>{l.username[0]?.toUpperCase()}</Text>
                        </View>}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.activityText} numberOfLines={1}>
                        <Text style={s.activityUsername}>{l.username}</Text>
                        <Text style={s.activityMuted}> listened</Text>
                        {l.rating != null && <Text style={s.activityRating}>  {"★".repeat(Math.floor(l.rating))}{l.rating % 1 !== 0 ? "½" : ""}</Text>}
                      </Text>
                      <Text style={s.activityTime}>{formatRelativeTime(l.listened_at)}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={s.activityEmpty}>No friends have listened recently.</Text>
              )}
            </View>
          </View>
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
    gap: 20,
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
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.gold,
  },
  reviewsTab: { gap: 16 },
  yourRating: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(24,24,27,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  yourRatingText: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  yourRatingStars: {
    color: "#fbbf24",
    fontWeight: "600",
  },
  yourRatingReview: {
    marginTop: 4,
    fontSize: 13,
    color: "#d4d4d8",
    fontStyle: "italic",
  },
  socialContent: { gap: 24 },
  socialSection: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(24,24,27,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activityAvatar: { width: 28, height: 28, borderRadius: 14, overflow: "hidden" },
  activityAvatarFallback: { backgroundColor: theme.colors.active, alignItems: "center", justifyContent: "center" },
  activityAvatarLetter: { fontSize: 10, fontWeight: "700", color: theme.colors.muted },
  activityText: { fontSize: 13 },
  activityUsername: { fontWeight: "700", color: theme.colors.text },
  activityMuted: { color: theme.colors.muted },
  activityRating: { color: "#fbbf24" },
  activityTime: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
  activityEmpty: { fontSize: 13, color: theme.colors.muted, textAlign: "center", paddingVertical: 16 },
});
