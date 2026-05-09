import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useHomeBillboard,
  useHomePulse,
  type TopArtistItem,
  type TopAlbumItem,
  type TopTrackItem,
} from "@/lib/hooks/useHomeDashboard";
import {
  useHomeBlindSpots,
  useHomeListeningReport,
} from "@/lib/hooks/useHomeHistory";
import { useProfile, type ProfileActivityItem } from "@/lib/hooks/useProfile";
import {
  ProfileActivityRow,
  ActivityEmpty,
  ActivitySeparator,
} from "@/components/profile/ActivityList";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";

type HomeTab = "billboard" | "pulse" | "history" | "activity";

export default function HomeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("billboard");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Tracklist</Text>
      </View>

      {/* Tab chips */}
      <View style={styles.tabRow}>
        <TabChip label="Billboard" active={tab === "billboard"} onPress={() => setTab("billboard")} />
        <TabChip label="Pulse" active={tab === "pulse"} onPress={() => setTab("pulse")} />
        <TabChip label="History" active={tab === "history"} onPress={() => setTab("history")} />
        <TabChip label="Activity" active={tab === "activity"} onPress={() => setTab("activity")} />
      </View>

      {tab === "billboard" && <BillboardTab router={router} />}
      {tab === "pulse" && <PulseTab router={router} />}
      {tab === "history" && <HistoryTab />}
      {tab === "activity" && <ActivityTab router={router} />}
    </SafeAreaView>
  );
}

// ─── Billboard Tab — the real weekly chart ─────────────────────────────────────

function BillboardTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { data: billboard, isLoading: billboardLoading } = useHomeBillboard();

  if (billboardLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const weeklyTop = billboard?.weeklyTop;
  const tracks = weeklyTop?.tracks.slice(0, 5) ?? [];
  const artists = weeklyTop?.artists.slice(0, 5) ?? [];
  const albums = weeklyTop?.albums.slice(0, 5) ?? [];
  const rangeLabel = weeklyTop?.rangeLabel;

  const hasData = tracks.length > 0 || artists.length > 0 || albums.length > 0;

  if (!hasData) {
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.emptyText}>
            No weekly chart yet. Billboard updates every Sunday after you&apos;ve logged listens.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {rangeLabel ? (
        <Text style={styles.rangeLabel}>{rangeLabel}</Text>
      ) : null}

      {/* Tracks */}
      {tracks.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Tracks</Text>
          {tracks.map((t: TopTrackItem, i: number) => (
            <Pressable
              key={t.trackId}
              style={({ pressed }: { pressed: boolean }) => [styles.chartRow, pressed && { opacity: 0.75 }]}
              onPress={() => router.push(`/song/${t.trackId}` as const)}
            >
              <Text style={styles.chartRank}>{i + 1}</Text>
              {t.albumImageUrl ? (
                <Image source={{ uri: t.albumImageUrl }} style={styles.chartArt} />
              ) : (
                <View style={[styles.chartArt, styles.chartArtPlaceholder]}>
                  <Text style={styles.albumPlaceholderIcon}>♪</Text>
                </View>
              )}
              <View style={styles.chartMeta}>
                <Text style={styles.chartTitle} numberOfLines={1}>{t.name}</Text>
                <Text style={styles.chartSub} numberOfLines={1}>{t.artistName}</Text>
              </View>
              <Text style={styles.chartPlays}>{t.playCount}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Artists */}
      {artists.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Artists</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {artists.map((a: TopArtistItem) => (
              <Pressable
                key={a.artistId}
                style={({ pressed }: { pressed: boolean }) => [styles.artistCard, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/artist/${a.artistId}` as const)}
              >
                {a.imageUrl ? (
                  <Image source={{ uri: a.imageUrl }} style={styles.artistImage} />
                ) : (
                  <View style={[styles.artistImage, styles.artistImagePlaceholder]}>
                    <Text style={styles.artistInitial}>{(a.name[0] ?? "?").toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.artistName} numberOfLines={2}>{a.name}</Text>
                <Text style={styles.playCount}>{a.playCount} plays</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Albums */}
      {albums.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Albums</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {albums.map((al: TopAlbumItem) => (
              <Pressable
                key={al.albumId}
                style={({ pressed }: { pressed: boolean }) => [styles.albumCard, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/album/${al.albumId}` as const)}
              >
                {al.imageUrl ? (
                  <Image source={{ uri: al.imageUrl }} style={styles.albumArt} />
                ) : (
                  <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
                    <Text style={styles.albumPlaceholderIcon}>♪</Text>
                  </View>
                )}
                <Text style={styles.albumName} numberOfLines={2}>{al.name}</Text>
                <Text style={styles.albumArtist} numberOfLines={1}>{al.artistName}</Text>
                <Text style={styles.playCount}>{al.playCount} plays</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── Pulse Tab — rolling 7-day top + pulse stats + narrative ───────────────────

function PulseTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { data: billboard, isLoading: billboardLoading } = useHomeBillboard();
  const { data: pulse, isLoading: pulseLoading } = useHomePulse();

  if (billboardLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const weeklyTop = billboard?.weeklyTop;
  const narrative = billboard?.narrative;
  const artists = weeklyTop?.artists.slice(0, 5) ?? [];
  const albums = weeklyTop?.albums.slice(0, 5) ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Narrative lede */}
      {narrative ? (
        <View style={styles.narrativeCard}>
          <Text style={styles.narrativeText}>{narrative}</Text>
        </View>
      ) : null}

      {/* Top artists strip */}
      {artists.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Artists This Week</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {artists.map((a: TopArtistItem) => (
              <Pressable
                key={a.artistId}
                style={({ pressed }: { pressed: boolean }) => [styles.artistCard, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/artist/${a.artistId}` as const)}
              >
                {a.imageUrl ? (
                  <Image source={{ uri: a.imageUrl }} style={styles.artistImage} />
                ) : (
                  <View style={[styles.artistImage, styles.artistImagePlaceholder]}>
                    <Text style={styles.artistInitial}>{(a.name[0] ?? "?").toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.artistName} numberOfLines={2}>{a.name}</Text>
                <Text style={styles.playCount}>{a.playCount} plays</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Top albums strip */}
      {albums.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Albums This Week</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {albums.map((al: TopAlbumItem) => (
              <Pressable
                key={al.albumId}
                style={({ pressed }: { pressed: boolean }) => [styles.albumCard, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/album/${al.albumId}` as const)}
              >
                {al.imageUrl ? (
                  <Image source={{ uri: al.imageUrl }} style={styles.albumArt} />
                ) : (
                  <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
                    <Text style={styles.albumPlaceholderIcon}>♪</Text>
                  </View>
                )}
                <Text style={styles.albumName} numberOfLines={2}>{al.name}</Text>
                <Text style={styles.albumArtist} numberOfLines={1}>{al.artistName}</Text>
                <Text style={styles.playCount}>{al.playCount} plays</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Pulse section */}
      {!pulseLoading && pulse ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pulse</Text>
          <Text style={styles.pulseCaption}>{pulse.rangeCaption}</Text>
          <View style={styles.pulseCard}>
            {pulse.playVolume ? (
              <View style={styles.pulseRow}>
                <Text style={[styles.pulseArrow, pulse.playVolume.trend === "up" ? styles.arrowUp : pulse.playVolume.trend === "down" ? styles.arrowDown : styles.arrowFlat]}>
                  {pulse.playVolume.trend === "up" ? "↑" : pulse.playVolume.trend === "down" ? "↓" : "↔"}
                </Text>
                <View style={styles.pulseRowText}>
                  <Text style={styles.pulseLabel}>Play volume</Text>
                  <Text style={styles.pulseMeta}>
                    {pulse.playVolume.percentChange > 0 ? "+" : ""}{Math.round(pulse.playVolume.percentChange)}% vs prior 7 days · {pulse.playVolume.currentPlays.toLocaleString()} plays
                  </Text>
                </View>
              </View>
            ) : null}
            {pulse.artistChange ? (
              <View style={styles.pulseRow}>
                <Text style={[styles.pulseArrow, pulse.artistChange.trend === "up" ? styles.arrowUp : pulse.artistChange.trend === "down" ? styles.arrowDown : styles.arrowFlat]}>
                  {pulse.artistChange.trend === "up" ? "↑" : pulse.artistChange.trend === "down" ? "↓" : "↔"}
                </Text>
                <View style={styles.pulseRowText}>
                  <Text style={styles.pulseLabel}>Artist momentum</Text>
                  <Text style={styles.pulseMeta}>{pulse.artistChange.name}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: blindSpots, isLoading: bsLoading } = useHomeBlindSpots();
  const { data: report, isLoading: reportLoading } = useHomeListeningReport();

  if (bsLoading || reportLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const hasBlindSpots = blindSpots?.hasData && (blindSpots.artists?.length ?? 0) > 0;
  const hasReport = report && (report.topArtists?.length ?? 0) > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Listening report */}
      {hasReport ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listening Report</Text>
          <Text style={styles.sectionMeta}>{report!.periodLabel}</Text>
          <View style={styles.card}>
            {report!.topArtists.slice(0, 3).map((a) => (
              <View key={a.name} style={styles.reportRow}>
                <Text style={styles.reportArtistName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.reportCount}>{a.count} plays</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Blind spots */}
      {hasBlindSpots ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blind Spots</Text>
          <Text style={styles.sectionMeta}>Artists you might love but haven&apos;t played yet</Text>
          <View style={styles.card}>
            {blindSpots!.artists.slice(0, 5).map((a) => (
              <View key={a.spotifyId} style={styles.blindSpotRow}>
                <View style={styles.blindSpotInfo}>
                  <Text style={styles.reportArtistName} numberOfLines={1}>{a.name}</Text>
                  {a.becauseOf.length > 0 ? (
                    <Text style={styles.blindSpotBecause} numberOfLines={1}>
                      Because you like {a.becauseOf.slice(0, 2).join(", ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!hasReport && !hasBlindSpots ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Log more listens to see your history insights here.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── Activity Tab ──────────────────────────────────────────────────────────────

function ActivityTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { recentActivity, isLoading } = useProfile();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  return (
    <FlatList<ProfileActivityItem>
      data={recentActivity}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <ProfileActivityRow
          item={item}
          onPressAlbum={(albumId: string) => router.push(`/album/${albumId}` as const)}
        />
      )}
      ItemSeparatorComponent={ActivitySeparator}
      ListEmptyComponent={<ActivityEmpty />}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── TabChip ───────────────────────────────────────────────────────────────────

function TabChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : styles.chipLabelIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingLeft: 18,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 10,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  logo: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: theme.colors.panel,
    borderColor: theme.colors.emerald,
  },
  chipIdle: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  chipLabelActive: {
    color: theme.colors.emerald,
  },
  chipLabelIdle: {
    color: theme.colors.muted,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 24,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  // Narrative
  narrativeCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    marginTop: 4,
  },
  narrativeText: {
    fontSize: 13,
    fontStyle: "italic",
    color: theme.colors.muted,
    lineHeight: 19,
  },
  // Sections
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionMeta: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: -4,
  },
  strip: {
    marginHorizontal: -4,
  },
  // Artist cards
  artistCard: {
    width: 100,
    alignItems: "center",
    gap: 6,
    marginHorizontal: 4,
  },
  artistImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.panel,
  },
  artistImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  artistInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  artistName: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
    lineHeight: 16,
  },
  // Album cards
  albumCard: {
    width: 120,
    gap: 5,
    marginHorizontal: 4,
  },
  albumArt: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: theme.colors.panel,
  },
  albumArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  albumPlaceholderIcon: {
    fontSize: 28,
    color: theme.colors.muted,
  },
  albumName: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    lineHeight: 16,
  },
  albumArtist: {
    fontSize: 11,
    color: theme.colors.muted,
  },
  playCount: {
    fontSize: 11,
    color: "#52525B",
  },
  // Pulse
  pulseCaption: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: -4,
  },
  pulseCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 14,
  },
  pulseRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  pulseArrow: {
    fontSize: 18,
    fontWeight: "700",
    width: 22,
    textAlign: "center",
    lineHeight: 22,
  },
  arrowUp: { color: "#10B981" },
  arrowDown: { color: "#F87171" },
  arrowFlat: { color: theme.colors.muted },
  pulseRowText: {
    flex: 1,
    gap: 2,
  },
  pulseLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  pulseMeta: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  // Report / blind spots
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  reportArtistName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  reportCount: {
    fontSize: 12,
    color: theme.colors.muted,
    marginLeft: 8,
  },
  blindSpotRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  blindSpotInfo: {
    gap: 2,
  },
  blindSpotBecause: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  rangeLabel: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  chartRank: {
    width: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  chartArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: theme.colors.border,
  },
  chartArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  chartMeta: {
    flex: 1,
    gap: 2,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  chartSub: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  chartPlays: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
    tabularNums: true,
  } as any,
});
