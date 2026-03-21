import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { DiscoverCard } from "../../components/discover/DiscoverCard";
import { DiscoverSection } from "../../components/discover/DiscoverSection";
import { HorizontalCarousel } from "../../components/discover/HorizontalCarousel";
import { useRisingArtists } from "../../lib/hooks/useDiscover";
import { useFeed } from "../../lib/hooks/useFeed";
import { useLeaderboard } from "../../lib/hooks/useLeaderboard";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { theme } from "../../lib/theme";
import type { FeedActivity } from "../../lib/types/feed";

const ALBUM_LIMIT = 16;
const SONG_LIMIT = 16;
const ARTIST_LIMIT = 16;
const REVIEW_LIMIT = 12;

/** Match feed `displayEntityName` for review titles */
function displayEntityName(
  raw: string | undefined,
  entityType: "album" | "song",
): string {
  const fallback = entityType === "album" ? "Unknown album" : "Unknown track";
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t || /^[a-zA-Z0-9]{22}$/.test(t)) return fallback;
  return t;
}

function DiscoverPageSkeleton() {
  return (
    <View style={skelStyles.wrap}>
      <View style={skelStyles.heroLineLg} />
      <View style={skelStyles.heroLineSm} />
      {[0, 1].map((section) => (
        <View key={section} style={skelStyles.section}>
          <View style={skelStyles.sectionTitle} />
          <View style={skelStyles.row}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={skelStyles.card}>
                <View style={skelStyles.cardArt} />
                <View style={skelStyles.cardText} />
                <View style={skelStyles.cardTextShort} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const skelStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 24,
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
  sectionTitle: {
    height: 22,
    width: "45%",
    borderRadius: 6,
    backgroundColor: theme.colors.border,
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
});

export default function DiscoverScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: popularAlbums = [],
    isLoading: isAlbumsLoading,
    refetch: refetchAlbums,
  } = useLeaderboard({ type: "albums", metric: "popular" });

  const {
    data: popularSongs = [],
    isLoading: isSongsLoading,
    refetch: refetchSongs,
  } = useLeaderboard({ type: "songs", metric: "popular" });

  const {
    data: risingArtists = [],
    isLoading: isArtistsLoading,
    refetch: refetchArtists,
  } = useRisingArtists(ARTIST_LIMIT);

  const {
    data: feedData,
    isPending: isFeedPending,
    refetch: refetchFeed,
  } = useFeed();

  const albums = useMemo(
    () => popularAlbums.slice(0, ALBUM_LIMIT),
    [popularAlbums],
  );
  const songs = useMemo(
    () => popularSongs.slice(0, SONG_LIMIT),
    [popularSongs],
  );

  const recentReviews = useMemo(() => {
    const flat = feedData?.pages.flatMap((p) => p.items) ?? [];
    const reviews = flat.filter(
      (a): a is Extract<FeedActivity, { type: "review" }> =>
        a.type === "review",
    );
    return reviews.slice(0, REVIEW_LIMIT);
  }, [feedData?.pages]);

  const mainLoading = isAlbumsLoading || isSongsLoading || isArtistsLoading;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchAlbums(),
        refetchSongs(),
        refetchArtists(),
        refetchFeed(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAlbums, refetchSongs, refetchArtists, refetchFeed]);

  const hasAnyContent =
    albums.length > 0 ||
    songs.length > 0 ||
    risingArtists.length > 0 ||
    recentReviews.length > 0;

  const showEmpty = !mainLoading && !isFeedPending && !hasAnyContent;

  const albumW = 164;
  const songW = 132;
  const artistW = 104;
  const reviewW = 232;

  const renderAlbumCard = useCallback(
    (item: (typeof albums)[number]) => (
      <DiscoverCard
        variant="album"
        title={item.title}
        subtitle={item.artist}
        imageUrl={item.artworkUrl}
        onPress={() => router.push(`/album/${item.id}`)}
      />
    ),
    [router],
  );

  const renderSongCard = useCallback(
    (item: (typeof songs)[number]) => (
      <DiscoverCard
        variant="song"
        title={item.title}
        subtitle={item.artist}
        imageUrl={item.artworkUrl}
        onPress={() => router.push(`/song/${item.id}`)}
      />
    ),
    [router],
  );

  const renderArtistCard = useCallback(
    (item: (typeof risingArtists)[number]) => (
      <DiscoverCard
        variant="artist"
        title={item.name}
        imageUrl={item.avatar_url}
        onPress={() => router.push(`/artist/${item.artist_id}`)}
      />
    ),
    [router],
  );

  const renderReviewCard = useCallback(
    (item: (typeof recentReviews)[number]) => {
      const review = item.review;
      const title = displayEntityName(item.spotifyName, review.entity_type);
      const user = review.user?.username;
      const subtitle = user ? `@${user}` : "Review";
      return (
        <DiscoverCard
          variant="review"
          title={title}
          subtitle={subtitle}
          onPress={() =>
            review.entity_type === "album"
              ? router.push(`/album/${review.entity_id}`)
              : router.push(`/song/${review.entity_id}`)
          }
        />
      );
    },
    [router],
  );

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
          <Text style={styles.heroTitle}>Discover</Text>
          <Text style={styles.heroSub}>
            Trending music from the Tracklist community
          </Text>
        </View>

        {mainLoading ? (
          <DiscoverPageSkeleton />
        ) : (
          <>
            {albums.length > 0 ? (
              <DiscoverSection title="Trending Albums" seeAllLabel="See all">
                <HorizontalCarousel
                  data={albums}
                  keyExtractor={(item) => item.id}
                  itemWidth={albumW}
                  renderCard={renderAlbumCard}
                />
              </DiscoverSection>
            ) : null}

            {songs.length > 0 ? (
              <DiscoverSection title="Trending Songs" seeAllLabel="See all">
                <HorizontalCarousel
                  data={songs}
                  keyExtractor={(item) => item.id}
                  itemWidth={songW}
                  renderCard={renderSongCard}
                />
              </DiscoverSection>
            ) : null}

            {risingArtists.length > 0 ? (
              <DiscoverSection title="Popular Artists" seeAllLabel="See all">
                <HorizontalCarousel
                  data={risingArtists}
                  keyExtractor={(item) => item.artist_id}
                  itemWidth={artistW}
                  renderCard={renderArtistCard}
                />
              </DiscoverSection>
            ) : null}

            {isFeedPending && !mainLoading ? (
              <View style={styles.feedSkel}>
                <View style={skelStyles.sectionTitle} />
                <View style={styles.feedSkelBar} />
                <View style={styles.feedSkelBarShort} />
              </View>
            ) : recentReviews.length > 0 ? (
              <DiscoverSection title="Recently reviewed" seeAllLabel="See all">
                <HorizontalCarousel
                  data={recentReviews}
                  keyExtractor={(item) => item.review.id}
                  itemWidth={reviewW}
                  renderCard={renderReviewCard}
                />
              </DiscoverSection>
            ) : null}

            {showEmpty ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing to discover right now</Text>
                <Text style={styles.emptyBody}>
                  Pull down to refresh, or check back soon for new picks.
                </Text>
              </View>
            ) : null}
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
  feedSkel: {
    paddingHorizontal: 18,
    marginBottom: 28,
    gap: 10,
  },
  feedSkelBar: {
    height: 56,
    borderRadius: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  feedSkelBarShort: {
    height: 56,
    width: "72%",
    borderRadius: 12,
    backgroundColor: theme.colors.border,
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
