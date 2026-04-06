import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { DiscoverSection } from "@/components/discover/DiscoverSection";
import { HorizontalCarousel } from "@/components/discover/HorizontalCarousel";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { useExploreHub } from "@/lib/hooks/useExploreHub";
import { useHiddenGemsGrid, useRisingArtists } from "@/lib/hooks/useDiscover";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import type { HiddenGemGridItem, RisingArtist } from "@repo/types";
import type { ExploreHubTrendingItem } from "@/lib/types/explore-hub";

const TRENDING_CAP = 20;
const RISING_CAP = 20;
const GEMS_CAP = 20;

type TrendingWithTrack = ExploreHubTrendingItem & {
  track: NonNullable<ExploreHubTrendingItem["track"]>;
};

function trackAlbumArtworkUrl(track: TrendingWithTrack["track"]): string | null {
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  for (const im of imgs) {
    const u = im?.url?.trim();
    if (u) return u;
  }
  return null;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: hub, trendingQuery, refetch: refetchHub } = useExploreHub();
  const { data: rising = [], refetch: refetchRising } =
    useRisingArtists(RISING_CAP);
  const {
    data: gemGrid = [],
    refetch: refetchGems,
    isPending: gemsGridPending,
  } = useHiddenGemsGrid(GEMS_CAP);

  const gemMediaItems = useMemo((): MediaItem[] => {
    return gemGrid.map((g) => ({
      id: g.entity_id,
      title: g.title,
      artist: `${g.artist} · ${g.avg_rating.toFixed(1)}★ · ${g.listen_count.toLocaleString()} plays`,
      artworkUrl: g.artwork_url,
    }));
  }, [gemGrid]);

  const trendingItems = useMemo((): TrendingWithTrack[] => {
    const raw = hub?.trending ?? [];
    const valid = raw.filter((x): x is TrendingWithTrack => x.track != null);
    return valid.slice(0, TRENDING_CAP);
  }, [hub?.trending]);

  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/explore");
    }
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchHub(), refetchRising(), refetchGems()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchHub, refetchRising, refetchGems]);

  const renderTrendingCard = useCallback(
    (item: TrendingWithTrack) => {
      const { entity, track } = item;
      const art = trackAlbumArtworkUrl(track);
      const plays = entity.listen_count?.toLocaleString() ?? "0";
      return (
        <DiscoverCard
          variant="song"
          title={track.name}
          subtitle={`${plays} plays`}
          imageUrl={art}
          onPress={() => router.push(`/song/${track.id}` as const)}
        />
      );
    },
    [router],
  );

  const onGemMediaPress = useCallback(
    (item: MediaItem) => {
      const g = gemGrid.find((x) => x.entity_id === item.id);
      if (!g) return;
      if (g.entity_type === "album") {
        router.push(`/album/${g.entity_id}` as const);
      } else {
        router.push(`/song/${g.entity_id}` as const);
      }
    },
    [gemGrid, router],
  );

  const showHubLoading = trendingQuery.isLoading;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
        <View style={styles.topBarTitle}>
          <Text style={styles.backHint}>Explore</Text>
          <Text style={styles.pageTitle}>Discover</Text>
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.emerald}
            colors={[theme.colors.emerald]}
          />
        }
      >
        <Text style={styles.heroSub}>
          Trending tracks, rising artists, and hidden gems.
        </Text>
        <View style={styles.linksRow}>
          <Pressable
            onPress={() => router.push("/search/users" as const)}
            hitSlop={8}
          >
            <Text style={styles.inlineLink}>Find users →</Text>
          </Pressable>
        </View>

        {showHubLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.emerald} />
          </View>
        ) : (
          <>
            <DiscoverSection title="Trending" description="Last 24 hours on Tracklist.">
              {trendingItems.length > 0 ? (
                <HorizontalCarousel<TrendingWithTrack>
                  data={trendingItems}
                  keyExtractor={(item) => item.entity.entity_id}
                  itemWidth={132}
                  renderCard={renderTrendingCard}
                />
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    No trending tracks in the last 24 hours.
                  </Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Rising artists"
              description="Strong growth in listens over the last week."
            >
              {rising.length === 0 ? (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>No rising artists yet.</Text>
                </View>
              ) : (
                <HorizontalCarousel<RisingArtist>
                  data={rising}
                  keyExtractor={(a) => a.artist_id}
                  itemWidth={120}
                  renderCard={(a) => (
                    <DiscoverCard
                      variant="artist"
                      title={a.name}
                      imageUrl={a.avatar_url}
                      onPress={() =>
                        router.push(`/artist/${a.artist_id}` as const)
                      }
                    />
                  )}
                />
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Hidden gems"
              description="Highly rated with fewer listens."
            >
              {gemsGridPending && gemMediaItems.length === 0 ? (
                <View style={styles.inlineEmpty}>
                  <ActivityIndicator color={theme.colors.emerald} />
                </View>
              ) : gemMediaItems.length === 0 ? (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    No hidden gems yet. Rate music to surface under-the-radar picks.
                  </Text>
                </View>
              ) : (
                <View style={styles.gemsGridWrap}>
                  <MediaGrid
                    data={gemMediaItems}
                    numColumns={2}
                    scrollEnabled={false}
                    onPressItem={onGemMediaPress}
                  />
                </View>
              )}
            </DiscoverSection>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
  },
  pressed: {
    opacity: 0.88,
  },
  topBarTitle: {
    flex: 1,
    marginLeft: 4,
  },
  backHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  topBarSpacer: {
    width: 32,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingTop: 8,
  },
  heroSub: {
    paddingHorizontal: 18,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 18,
    marginTop: 10,
    marginBottom: 8,
  },
  inlineLink: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  centered: {
    paddingVertical: 48,
    alignItems: "center",
  },
  inlineEmpty: {
    marginHorizontal: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  inlineEmptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    textAlign: "center",
  },
  gemsGridWrap: {
    paddingHorizontal: 18,
  },
});
