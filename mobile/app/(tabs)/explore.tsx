import { useCallback, useState } from "react";
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
import {
  useExploreDiscoveryBundle,
  type ExploreRangeParam,
} from "@/lib/hooks/useExploreDiscoveryBundle";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import type {
  ExploreCommunityContrastRow,
  ExploreDiscoveryReviewEntityItem,
  ExploreDiscoveryTrackItem,
} from "@/lib/types/explore-hub";

function MovementRow({
  rankDelta,
  badge,
}: {
  rankDelta: number | null;
  badge: "new" | "hot" | null;
}) {
  const parts: string[] = [];
  if (badge === "new") parts.push("NEW");
  if (badge === "hot") parts.push("HOT");
  if (rankDelta != null && rankDelta !== 0) {
    parts.push(rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`);
  }
  if (parts.length === 0) return null;
  return (
    <Text style={moveStyles.pill} numberOfLines={1}>
      {parts.join(" · ")}
    </Text>
  );
}

const moveStyles = StyleSheet.create({
  pill: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.emerald,
    marginTop: 4,
  },
});

function DiscoverPageSkeleton() {
  return (
    <View style={skelStyles.wrap}>
      <View style={skelStyles.heroLineLg} />
      <View style={skelStyles.heroLineSm} />
      <View style={skelStyles.rangeRow} />
      {[0, 1, 2].map((s) => (
        <View key={s} style={skelStyles.section}>
          <View style={skelStyles.sectionHeaderRow}>
            <View style={skelStyles.sectionTitleBlock}>
              <View style={skelStyles.sectionTitle} />
              <View style={skelStyles.sectionDesc} />
            </View>
          </View>
          <View style={skelStyles.row}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={skelStyles.card}>
                <View style={skelStyles.cardArt} />
                <View style={skelStyles.cardText} />
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
  rangeRow: {
    height: 40,
    width: "70%",
    borderRadius: 12,
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
});

function RangeToggle({
  value,
  onChange,
}: {
  value: ExploreRangeParam;
  onChange: (r: ExploreRangeParam) => void;
}) {
  return (
    <View style={rangeStyles.wrap}>
      <Pressable
        onPress={() => onChange("24h")}
        style={[
          rangeStyles.seg,
          value === "24h" && rangeStyles.segActive,
        ]}
      >
        <Text
          style={[
            rangeStyles.segText,
            value === "24h" && rangeStyles.segTextActive,
          ]}
        >
          24h
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("week")}
        style={[
          rangeStyles.seg,
          value === "week" && rangeStyles.segActive,
        ]}
      >
        <Text
          style={[
            rangeStyles.segText,
            value === "week" && rangeStyles.segTextActive,
          ]}
        >
          7 days
        </Text>
      </Pressable>
    </View>
  );
}

const rangeStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segActive: {
    backgroundColor: theme.colors.emerald,
  },
  segText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  segTextActive: {
    color: "#fff",
  },
});

function TalkedAboutRow({
  item,
  onPress,
}: {
  item: ExploreDiscoveryReviewEntityItem;
  onPress: () => void;
}) {
  const snippet =
    "review_snippet" in item ? item.review_snippet : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [talkStyles.row, pressed && { opacity: 0.9 }]}
    >
      <Artwork
        src={item.image_url}
        size="md"
        style={talkStyles.art}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={talkStyles.title} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={talkStyles.sub} numberOfLines={1}>
          {item.artist}
        </Text>
        <Text style={talkStyles.meta} numberOfLines={1}>
          {item.stat_label}
        </Text>
        <MovementRow
          rankDelta={item.movement.rank_delta}
          badge={item.movement.badge}
        />
        {snippet ? (
          <Text style={talkStyles.quote} numberOfLines={3}>
            “{snippet}”
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const talkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 18,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  art: {
    borderRadius: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.muted,
  },
  quote: {
    marginTop: 8,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
    color: theme.colors.text,
    opacity: 0.9,
  },
});

function HiddenGemRow({
  item,
  onPress,
}: {
  item: ExploreDiscoveryTrackItem | {
    kind: "album";
    id: string;
    name: string;
    artist: string;
    image_url: string | null;
    href: string;
    movement: ExploreDiscoveryTrackItem["movement"];
    stat_label: string;
    review_snippet: string | null;
  };
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [gemStyles.row, pressed && { opacity: 0.9 }]}
    >
      <Artwork src={item.image_url} size="lg" style={gemStyles.art} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={gemStyles.title} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={gemStyles.sub} numberOfLines={1}>
          {item.artist}
        </Text>
        <Text style={gemStyles.meta} numberOfLines={1}>
          {item.stat_label}
        </Text>
        <MovementRow
          rankDelta={item.movement.rank_delta}
          badge={item.movement.badge}
        />
      </View>
    </Pressable>
  );
}

const gemStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  art: {
    borderRadius: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sub: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.muted,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.muted,
  },
});

function CommunityCard({
  row,
  onOpenCommunity,
  onOpenTrack,
}: {
  row: ExploreCommunityContrastRow;
  onOpenCommunity: () => void;
  onOpenTrack: () => void;
}) {
  return (
    <View style={comStyles.card}>
      <Text style={comStyles.name}>{row.community_name}</Text>
      <Text style={comStyles.hint}>#1 track (month)</Text>
      <Pressable
        onPress={onOpenTrack}
        style={({ pressed }) => [
          comStyles.trackRow,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Artwork
          src={row.top_track_image}
          size="md"
          style={comStyles.art}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={comStyles.trackTitle} numberOfLines={2}>
            {row.top_track_name}
          </Text>
          <Pressable onPress={onOpenCommunity}>
            <Text style={comStyles.link}>Community →</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const comStyles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 6,
  },
  name: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.muted,
    textTransform: "uppercase",
  },
  hint: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  art: { borderRadius: 8 },
  trackTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  link: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
});

export default function ExploreScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<ExploreRangeParam>("week");
  const { data, isPending, isError, refetch, isFetching } =
    useExploreDiscoveryBundle(range);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const goDiscover = useCallback(() => {
    router.push("/discover" as const);
  }, [router]);

  const goLeaderboard = useCallback(() => {
    router.push({
      pathname: "/leaderboard",
      params: { type: "songs", metric: "popular" },
    });
  }, [router]);

  const goFindUsers = useCallback(() => {
    router.push("/search/users" as const);
  }, [router]);

  const navigateHref = useCallback(
    (href: string) => {
      router.push(href as `/song/${string}` | `/album/${string}` | `/communities/${string}`);
    },
    [router],
  );

  const renderBlowingCard = useCallback(
    (item: ExploreDiscoveryTrackItem) => (
      <DiscoverCard
        variant="song"
        title={item.name}
        subtitle={item.stat_label}
        imageUrl={item.image_url}
        onPress={() => navigateHref(item.href)}
      />
    ),
    [navigateHref],
  );

  const renderLovedCard = useCallback(
    (item: ExploreDiscoveryTrackItem) => (
      <DiscoverCard
        variant="song"
        title={item.name}
        subtitle={`${item.stat_label}${item.movement.badge ? ` · ${item.movement.badge}` : ""}`}
        imageUrl={item.image_url}
        onPress={() => navigateHref(item.href)}
      />
    ),
    [navigateHref],
  );

  const showSkeleton = isPending && !data;

  const blowing = data?.blowing_up ?? [];
  const talked = data?.most_talked_about ?? [];
  const loved = data?.most_loved ?? [];
  const gems = data?.hidden_gems ?? [];
  const communities = data?.across_communities ?? [];

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
            Live discovery — rising tracks, reviews, saves, and community picks.
            Leaderboard is one tap away.
          </Text>
        </View>

        <View style={styles.rangePad}>
          <Text style={styles.rangeLabel}>Window</Text>
          <RangeToggle value={range} onChange={setRange} />
          {isFetching && data ? (
            <Text style={styles.refreshHint}>Updating…</Text>
          ) : null}
        </View>

        {isError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn't load Explore</Text>
            <Text style={styles.emptyBody}>
              Pull down to try again, or check your connection.
            </Text>
          </View>
        ) : showSkeleton ? (
          <DiscoverPageSkeleton />
        ) : (
          <>
            <DiscoverSection
              title="Blowing up"
              description="Fastest-rising tracks vs the last window."
              actionLabel="Charts →"
              onActionPress={goDiscover}
            >
              {blowing.length > 0 ? (
                <HorizontalCarousel
                  data={blowing}
                  keyExtractor={(item) => item.id}
                  itemWidth={132}
                  renderCard={renderBlowingCard}
                />
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    Not enough movement in this window yet.
                  </Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Most talked about"
              description="Most reviews + top quote."
              actionLabel="Discover →"
              onActionPress={goDiscover}
            >
              {talked.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {talked.map((item) => (
                    <TalkedAboutRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      onPress={() => navigateHref(item.href)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>No review activity yet.</Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Most loved"
              description="Saves, repeats, and plays in this window."
            >
              {loved.length > 0 ? (
                <HorizontalCarousel
                  data={loved}
                  keyExtractor={(item) => item.id}
                  itemWidth={132}
                  renderCard={renderLovedCard}
                />
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    No love scores in this window yet.
                  </Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Hidden gems"
              description="Strong engagement without huge play counts."
            >
              {gems.length > 0 ? (
                gems.map((item) => (
                  <HiddenGemRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onPress={() => navigateHref(item.href)}
                  />
                ))
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    No hidden gems surfaced yet.
                  </Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Across communities"
              description="Each group's #1 track this month."
              actionLabel="Communities →"
              onActionPress={() => router.push("/communities" as const)}
            >
              {communities.length > 0 ? (
                communities.map((row) => (
                  <CommunityCard
                    key={row.community_id}
                    row={row}
                    onOpenCommunity={() =>
                      router.push(row.href as `/communities/${string}`)
                    }
                    onOpenTrack={() =>
                      router.push(`/song/${row.top_track_id}` as const)
                    }
                  />
                ))
              ) : (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>
                    No public community charts yet.
                  </Text>
                </View>
              )}
            </DiscoverSection>

            <DiscoverSection
              title="Classic leaderboard"
              description="All-time popular songs & albums."
              actionLabel="Open →"
              onActionPress={goLeaderboard}
            >
              <Pressable
                onPress={goLeaderboard}
                style={({ pressed }) => [
                  styles.ctaCard,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text style={styles.ctaBody}>
                  Prefer ranked lists? Open the global leaderboard anytime.
                </Text>
                <Text style={styles.findLink}>Go to leaderboard →</Text>
              </Pressable>
            </DiscoverSection>

            <DiscoverSection
              title="More charts"
              description="Trending strips, rising artists, hidden gems."
              actionLabel="Discover →"
              onActionPress={goDiscover}
            >
              <Pressable
                onPress={goDiscover}
                style={({ pressed }) => [
                  styles.ctaCard,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text style={styles.ctaBody}>
                  Full Discover page with trending, rising artists, and more.
                </Text>
                <Text style={styles.findLink}>Open Discover →</Text>
              </Pressable>
            </DiscoverSection>

            <DiscoverSection
              title="Find people"
              description="Search by username or browse similar taste."
              actionLabel="Find people →"
              onActionPress={goFindUsers}
            >
              <Pressable
                onPress={goFindUsers}
                style={({ pressed }) => [
                  styles.findCard,
                  pressed && styles.ctaPressed,
                ]}
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
  rangePad: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
    width: "100%",
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  refreshHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
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
    gap: 12,
  },
  ctaBody: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 21,
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
