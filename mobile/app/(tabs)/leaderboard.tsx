import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { YearRangeFilter, type YearRange } from "@/components/filters/YearRangeFilter";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import type {
  LeaderboardItem,
  LeaderboardMetricInput,
  LeaderboardTypeInput,
} from "@/lib/hooks/useLeaderboard";
import { useLeaderboard } from "@/lib/hooks/useLeaderboard";

// ── Types ─────────────────────────────────────────────────────────────────

type Era = "all" | "2020s" | "2010s" | "2000s" | "1990s" | "1980s" | "1970s" | "older" | "custom";

// ── Helpers ───────────────────────────────────────────────────────────────

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function eraToYears(era: Era, custom: YearRange): { startYear?: number; endYear?: number } {
  if (era === "custom") return custom;
  const map: Record<string, { startYear: number; endYear: number }> = {
    "2020s": { startYear: 2020, endYear: 2029 },
    "2010s": { startYear: 2010, endYear: 2019 },
    "2000s": { startYear: 2000, endYear: 2009 },
    "1990s": { startYear: 1990, endYear: 1999 },
    "1980s": { startYear: 1980, endYear: 1989 },
    "1970s": { startYear: 1970, endYear: 1979 },
    "older": { startYear: 1900, endYear: 1969 },
  };
  return map[era] ?? {};
}

function statLabel(item: LeaderboardItem, metric: LeaderboardMetricInput): string {
  if (metric === "top_rated") {
    return item.rating != null ? `★ ${item.rating.toFixed(1)}` : "";
  }
  if (metric === "favorited") {
    const fav = item.favoriteCount != null ? `♡ ${item.favoriteCount.toLocaleString()}` : null;
    const plays = item.playCount > 0 ? `${item.playCount.toLocaleString()} plays` : null;
    return [fav, plays].filter(Boolean).join(" · ");
  }
  return item.playCount > 0 ? `${item.playCount.toLocaleString()} plays` : "";
}

// ── Constants ─────────────────────────────────────────────────────────────

const PLACEHOLDER = "https://placehold.co/300x300/111827/9CA3AF?text=Tracklist";
const GRID_PAD = 12;
const GRID_GAP = 8;
const NUM_COLS = 3;

const ERA_OPTIONS: { label: string; value: Era }[] = [
  { label: "All time", value: "all" },
  { label: "2020s", value: "2020s" },
  { label: "2010s", value: "2010s" },
  { label: "2000s", value: "2000s" },
  { label: "1990s", value: "1990s" },
  { label: "1980s", value: "1980s" },
  { label: "1970s", value: "1970s" },
  { label: "Pre-1970", value: "older" },
  { label: "Custom", value: "custom" },
];

// ── BrowseCard ────────────────────────────────────────────────────────────

function BrowseCard({
  item,
  rank,
  metric,
}: {
  item: LeaderboardItem;
  rank: number;
  metric: LeaderboardMetricInput;
}) {
  const router = useRouter();
  const href = item.entityType === "album" ? `/album/${item.id}` : `/song/${item.id}`;
  const uri = item.artworkUrl ?? PLACEHOLDER;
  const stat = statLabel(item, metric);

  return (
    <Pressable
      onPress={() => router.push(href as `/album/${string}` | `/song/${string}`)}
      style={({ pressed }) => [cardStyles.card, pressed && cardStyles.cardPressed]}
    >
      <View style={cardStyles.imageFrame}>
        <Image
          recyclingKey={uri}
          source={{ uri }}
          style={cardStyles.image}
          contentFit="cover"
          transition={100}
          cachePolicy="memory-disk"
        />
        <View style={cardStyles.rankBadge}>
          <Text style={cardStyles.rankText}>{rank}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
  },
  cardPressed: {
    opacity: 0.8,
  },
  imageFrame: {
    aspectRatio: 1,
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  rankBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rankText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },
  title: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    lineHeight: 16,
  },
  artist: {
    marginTop: 1,
    fontSize: 11,
    color: theme.colors.muted,
  },
  stat: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "500",
    color: theme.colors.emerald,
  },
});

// ── FilterChips — same compact pill style as era row ─────────────────────

function FilterChips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[chipStyles.chip, active && chipStyles.chipActive]}
          >
            <Text style={[chipStyles.text, active && chipStyles.textActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  textActive: {
    color: theme.colors.panel,
  },
});

// ── Screen ────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const params = useLocalSearchParams();

  const [type, setType] = useState<LeaderboardTypeInput>(() => {
    const p = firstParam(params.type as string | string[] | undefined);
    return p === "songs" ? "songs" : "albums";
  });
  const [metric, setMetric] = useState<LeaderboardMetricInput>(() => {
    const p = firstParam(params.metric as string | string[] | undefined);
    if (p === "top_rated" || p === "favorited") return p;
    return "popular";
  });
  const [era, setEra] = useState<Era>("all");
  const [customRange, setCustomRange] = useState<YearRange>({});

  const years = useMemo(() => eraToYears(era, customRange), [era, customRange]);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLeaderboard({ type, metric, ...years });

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sortOptions = useMemo(
    () =>
      type === "albums"
        ? [
            { value: "popular", label: "Plays" },
            { value: "top_rated", label: "Rating" },
            { value: "favorited", label: "Favorites" },
          ]
        : [
            { value: "popular", label: "Plays" },
            { value: "top_rated", label: "Rating" },
          ],
    [type],
  );

  const handleTypeChange = useCallback(
    (v: string) => {
      const next = v as LeaderboardTypeInput;
      setType(next);
      if (next === "songs" && metric === "favorited") setMetric("popular");
    },
    [metric],
  );

  const handleEraChange = useCallback((v: Era) => {
    setEra(v);
    if (v !== "custom") setCustomRange({});
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardItem; index: number }) => (
      <BrowseCard item={item} rank={index + 1} metric={metric} />
    ),
    [metric],
  );

  const eraLabel = era === "all" ? "" : era === "older" ? "Pre-1970" : era === "custom" ? "" : era;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Browse</Text>
        <Text style={s.subtitle}>
          Most played, highest rated, and most favorited music on Tracklist.
        </Text>
      </View>

      <View style={s.filters}>
        {/* Entity + sort on one scrollable row with a separator dot */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          <FilterChips
            value={type}
            options={[
              { value: "albums", label: "Albums" },
              { value: "songs", label: "Tracks" },
            ]}
            onChange={handleTypeChange}
          />
          <Text style={s.filterSep}>·</Text>
          <FilterChips
            value={metric}
            options={sortOptions}
            onChange={(v) => setMetric(v as LeaderboardMetricInput)}
          />
        </ScrollView>

        {/* Era chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.eraRow}>
          {ERA_OPTIONS.map((opt) => {
            const active = era === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleEraChange(opt.value)}
                style={[s.eraChip, active && s.eraChipActive]}
              >
                <Text style={[s.eraChipText, active && s.eraChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {era === "custom" && (
          <YearRangeFilter value={customRange} onChange={setCustomRange} />
        )}
      </View>


      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.emerald} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={s.emptyText}>Failed to load. Pull down to retry.</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyText}>No results for this combination.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => `${item.entityType}-${item.id}`}
          numColumns={NUM_COLS}
          renderItem={renderItem}
          columnWrapperStyle={s.row}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          contentContainerStyle={s.grid}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.35}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={theme.colors.emerald} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingLeft: GRID_PAD,
    paddingRight: GRID_PAD + NOTIFICATION_BELL_GUTTER,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20,
  },
  filters: {
    paddingHorizontal: GRID_PAD,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: GRID_PAD,
  },
  filterSep: {
    fontSize: 14,
    color: "#52525b",
    paddingHorizontal: 2,
  },
  eraRow: {
    gap: 6,
    paddingRight: GRID_PAD,
  },
  eraChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  eraChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  eraChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  eraChipTextActive: {
    color: theme.colors.panel,
  },
  count: {
    paddingHorizontal: GRID_PAD,
    paddingBottom: 6,
    paddingTop: 2,
    fontSize: 12,
    color: theme.colors.muted,
  },
  grid: {
    paddingHorizontal: GRID_PAD,
    paddingBottom: 100,
  },
  row: {
    gap: GRID_GAP,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
});
