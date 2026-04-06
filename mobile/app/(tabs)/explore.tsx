import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Artwork } from "@/components/media/Artwork";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { DiscoverSection } from "@/components/discover/DiscoverSection";
import { HorizontalCarousel } from "@/components/discover/HorizontalCarousel";
import { exploreTrackArtworkUrl } from "@/lib/explore-track-artwork";
import { useExploreHub } from "@/lib/hooks/useExploreHub";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import type {
  ExploreHubLeaderboardEntry,
  ExploreHubTrendingItem,
  ExploreReviewPreviewRow,
} from "@/lib/types/explore-hub";

const TRENDING_CAROUSEL_CAP = 16;
const LEADERBOARD_PREVIEW = 5;

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

function DiscoverPageSkeleton() {
  return (
    <View style={skelStyles.wrap}>
      <View style={skelStyles.heroLineLg} />
      <View style={skelStyles.heroLineSm} />

      {/* Trending */}
      <View style={skelStyles.section}>
        <View style={skelStyles.sectionHeaderRow}>
          <View style={skelStyles.sectionTitleBlock}>
            <View style={skelStyles.sectionTitle} />
            <View style={skelStyles.sectionDesc} />
          </View>
          <View style={skelStyles.actionPill} />
        </View>
        <View style={skelStyles.row}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={skelStyles.card}>
              <View style={skelStyles.cardArt} />
              <View style={skelStyles.cardText} />
              <View style={skelStyles.cardTextShort} />
            </View>
          ))}
        </View>
      </View>

      {/* Leaderboard */}
      <View style={skelStyles.section}>
        <View style={skelStyles.sectionHeaderRow}>
          <View style={skelStyles.sectionTitleBlock}>
            <View style={[skelStyles.sectionTitle, { width: "42%" }]} />
            <View style={skelStyles.sectionDesc} />
          </View>
          <View style={skelStyles.actionPill} />
        </View>
        <View style={skelStyles.lbList}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={skelStyles.lbRow}>
              <View style={skelStyles.lbRank} />
              <View style={skelStyles.lbThumb} />
              <View style={skelStyles.lbTextCol}>
                <View style={skelStyles.cardText} />
                <View style={[skelStyles.cardTextShort, { width: "55%" }]} />
              </View>
              <View style={skelStyles.lbPlays} />
            </View>
          ))}
        </View>
      </View>

      {/* Discover */}
      <View style={skelStyles.section}>
        <View style={skelStyles.sectionHeaderRow}>
          <View style={skelStyles.sectionTitleBlock}>
            <View style={[skelStyles.sectionTitle, { width: "38%" }]} />
            <View style={skelStyles.sectionDesc} />
          </View>
          <View style={skelStyles.actionPill} />
        </View>
        <View style={skelStyles.ctaCard}>
          <View style={skelStyles.ctaLine} />
          <View style={[skelStyles.ctaLine, { width: "92%" }]} />
          <View style={skelStyles.ctaBtnRow}>
            <View style={skelStyles.ctaBtnPrimary} />
            <View style={skelStyles.ctaBtnGhost} />
          </View>
        </View>
      </View>

      {/* Find people */}
      <View style={skelStyles.section}>
        <View style={skelStyles.sectionHeaderRow}>
          <View style={skelStyles.sectionTitleBlock}>
            <View style={[skelStyles.sectionTitle, { width: "44%" }]} />
            <View style={skelStyles.sectionDesc} />
          </View>
          <View style={skelStyles.actionPill} />
        </View>
        <View style={skelStyles.findCard}>
          <View style={skelStyles.ctaLine} />
          <View style={[skelStyles.ctaLine, { width: "78%" }]} />
          <View style={skelStyles.findLinkSkel} />
        </View>
      </View>
    </View>
  );
}

const skelStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 28,
  },
  heroLineLg: {
    height: 28,
    width: "55%",
    borderRadius: 8,
    backgroundColor: theme.colors.border,
  },
  heroLineSm: {
    height: 14,
    width: "75%",
    borderRadius: 6,
    backgroundColor: theme.colors.panel,
  },
  section: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 8,
  },
  sectionTitle: {
    height: 22,
    width: "45%",
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  sectionDesc: {
    height: 14,
    width: "88%",
    borderRadius: 5,
    backgroundColor: theme.colors.panel,
  },
  actionPill: {
    width: 100,
    height: 16,
    marginTop: 2,
    borderRadius: 4,
    backgroundColor: theme.colors.panel,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    width: 120,
    gap: 8,
  },
  cardArt: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
  },
  cardText: {
    height: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  cardTextShort: {
    height: 10,
    width: "70%",
    borderRadius: 4,
    backgroundColor: theme.colors.panel,
  },
  lbList: {
    gap: 8,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  lbRank: {
    width: 18,
    height: 14,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  lbThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
  },
  lbTextCol: {
    flex: 1,
    gap: 6,
  },
  lbPlays: {
    width: 36,
    height: 12,
    borderRadius: 3,
    backgroundColor: theme.colors.panel,
  },
  ctaCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 12,
  },
  ctaLine: {
    height: 14,
    width: "100%",
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  ctaBtnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
  },
  ctaBtnPrimary: {
    width: 130,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.emerald,
    opacity: 0.35,
  },
  ctaBtnGhost: {
    width: 72,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.border,
  },
  findCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 10,
  },
  findLinkSkel: {
    height: 16,
    width: 140,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
});

function LeaderboardPreviewRows({
  entries,
  onPressEntry,
}: {
  entries: ExploreHubLeaderboardEntry[];
  onPressEntry: (entry: ExploreHubLeaderboardEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <View style={lbStyles.emptyBox}>
        <Text style={lbStyles.emptyText}>No leaderboard data yet.</Text>
      </View>
    );
  }

  return (
    <View style={lbStyles.list}>
      {entries.slice(0, LEADERBOARD_PREVIEW).map((entry, i) => (
        <Pressable
          key={`${entry.id}-${i}`}
          onPress={() => onPressEntry(entry)}
          style={({ pressed }) => [lbStyles.row, pressed && lbStyles.pressed]}
        >
          <Text style={lbStyles.rank}>{i + 1}</Text>
          <Artwork src={entry.artwork_url} size="sm" style={lbStyles.thumb} />
          <View style={lbStyles.rowText}>
            <Text style={lbStyles.rowTitle} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={lbStyles.rowSub} numberOfLines={1}>
              {entry.artist}
            </Text>
          </View>
          <Text style={lbStyles.plays}>
            {entry.total_plays.toLocaleString()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const lbStyles = StyleSheet.create({
  list: {
    paddingHorizontal: 18,
    gap: 8,
  },
  emptyBox: {
    marginHorizontal: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.88,
  },
  rank: {
    width: 22,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: theme.colors.muted,
  },
  thumb: {
    borderRadius: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  plays: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: theme.colors.muted,
  },
});

function RecentReviewsPreview({
  reviews,
  loading,
  onPressAlbum,
}: {
  reviews: ExploreReviewPreviewRow[];
  loading: boolean;
  onPressAlbum: (r: ExploreReviewPreviewRow) => void;
}) {
  if (loading) {
    return (
      <View style={lbStyles.emptyBox}>
        <Text style={lbStyles.emptyText}>Loading…</Text>
      </View>
    );
  }
  if (reviews.length === 0) {
    return (
      <View style={lbStyles.emptyBox}>
        <Text style={lbStyles.emptyText}>No recent album reviews yet.</Text>
      </View>
    );
  }
  return (
    <View style={revPreviewStyles.list}>
      {reviews.slice(0, 6).map((r) => (
        <Pressable
          key={r.id}
          onPress={() => onPressAlbum(r)}
          style={({ pressed }) => [
            revPreviewStyles.row,
            pressed && { opacity: 0.88 },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={revPreviewStyles.title} numberOfLines={1}>
              {r.album_name}
              <Text style={revPreviewStyles.meta}> · {r.artist_name}</Text>
            </Text>
            <Text style={revPreviewStyles.sub} numberOfLines={1}>
              {r.username} · {new Date(r.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text style={revPreviewStyles.rating}>★ {r.rating.toFixed(1)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const revPreviewStyles = StyleSheet.create({
  list: {
    paddingHorizontal: 18,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  meta: {
    fontWeight: "500",
    color: theme.colors.muted,
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  rating: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: "#fbbf24",
  },
});

export default function ExploreScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isPending, isError, refetch, reviewsQuery } = useExploreHub();

  const trendingItems = useMemo((): TrendingWithTrack[] => {
    const raw = data?.trending ?? [];
    const valid = raw.filter((x): x is TrendingWithTrack => x.track != null);
    return valid.slice(0, TRENDING_CAROUSEL_CAP);
  }, [data?.trending]);

  const leaderboardEntries = data?.leaderboard ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  /** Full charts / Discover page (web `/discover`). */
  const goDiscover = useCallback(() => {
    router.push("/discover" as const);
  }, [router]);

  /** Leaderboard tab with global popular songs (web `/leaderboard`). */
  const goLeaderboard = useCallback(() => {
    router.push({
      pathname: "/leaderboard",
      params: { type: "songs", metric: "popular" },
    });
  }, [router]);

  const goFindUsers = useCallback(() => {
    router.push("/search/users" as const);
  }, [router]);

  const renderTrendingCard = useCallback(
    (item: TrendingWithTrack) => {
      const { entity, track } = item;
      const art = exploreTrackArtworkUrl(track);
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

  const onLeaderboardEntry = useCallback(
    (entry: ExploreHubLeaderboardEntry) => {
      if (entry.entity_type === "album") {
        router.push(`/album/${entry.id}` as const);
      } else {
        router.push(`/song/${entry.id}` as const);
      }
    },
    [router],
  );

  const showSkeleton = isPending && !data;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        stickyHeaderIndices={Platform.OS === "ios" ? [0] : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.emerald}
            colors={[theme.colors.emerald]}
          />
        }
      >
        <View style={styles.stickyHeader}>
          <Text style={styles.heroTitle}>Explore</Text>
          <Text style={styles.heroSub}>
            Discovery, charts, and people — start here, then go deeper.
          </Text>
        </View>

        {isError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn&apos;t load Explore</Text>
            <Text style={styles.emptyBody}>
              Pull down to try again, or check your connection.
            </Text>
          </View>
        ) : showSkeleton ? (
          <DiscoverPageSkeleton />
        ) : (
          <>
            <DiscoverSection
              title="Trending"
              description="What listeners are playing in the last 24 hours."
              actionLabel="Full charts →"
              onActionPress={goDiscover}
            >
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
              title="Leaderboard"
              description="Most-played tracks on Tracklist."
              actionLabel="View all →"
              onActionPress={goLeaderboard}
            >
              <LeaderboardPreviewRows
                entries={leaderboardEntries}
                onPressEntry={onLeaderboardEntry}
              />
            </DiscoverSection>

            <DiscoverSection
              title="Discover"
              description="Rising artists, hidden gems, and personalized picks."
              actionLabel="Open Discover →"
              onActionPress={goDiscover}
            >
              <View style={styles.ctaCard}>
                <Text style={styles.ctaBody}>
                  Browse curated charts, recommendations, and community picks in
                  one place.
                </Text>
                <Pressable
                  onPress={goDiscover}
                  style={({ pressed }) => [
                    styles.ctaPrimary,
                    pressed && styles.ctaPressed,
                  ]}
                >
                  <Text style={styles.ctaPrimaryText}>Go to Discover</Text>
                </Pressable>
              </View>
            </DiscoverSection>

            <DiscoverSection
              title="Recent reviews"
              description="Latest album ratings from the community."
              actionLabel="Browse Discover →"
              onActionPress={goDiscover}
            >
              <RecentReviewsPreview
                reviews={data?.reviews ?? []}
                loading={reviewsQuery.isLoading}
                onPressAlbum={(r: ExploreReviewPreviewRow) =>
                  router.push(`/album/${r.entity_id}` as const)
                }
              />
            </DiscoverSection>

            <DiscoverSection
              title="Find people"
              description="Search by username or browse members with similar taste."
              actionLabel="Find people →"
              onActionPress={goFindUsers}
            >
              <Pressable
                onPress={goFindUsers}
                style={({ pressed }) => [styles.findCard, pressed && styles.ctaPressed]}
              >
                <Text style={styles.ctaBody}>
                  Follow friends, invite collaborators, and grow your network.
                </Text>
                <Text style={styles.findLink}>Open search →</Text>
              </Pressable>
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
  scrollContent: {
    paddingBottom: 100,
  },
  stickyHeader: {
    backgroundColor: theme.colors.bg,
    paddingLeft: 18,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
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
  ctaCard: {
    marginHorizontal: 18,
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 16,
  },
  ctaBody: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 21,
  },
  ctaPrimary: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  ctaPressed: {
    opacity: 0.9,
  },
  findCard: {
    marginHorizontal: 18,
    padding: 20,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 12,
  },
  findLink: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
