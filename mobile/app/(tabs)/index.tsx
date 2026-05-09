import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useHomeBillboard,
  useHomePulse,
  useWeeklyChart,
  type TopArtistItem,
  type TopAlbumItem,
  type TopTrackItem,
  type ChartRankingRow,
  type ChartMoverEntry,
  isDropout,
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

const NARRATIVE_ICONS = ["✦", "↗", "↑"];

function MovementBadge({ row }: { row: ChartRankingRow }) {
  if (row.is_new || row.is_reentry) {
    return <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>;
  }
  if (row.has_positive_movement && row.movement != null && row.movement > 0) {
    return (
      <View style={styles.moveBadgeUp}>
        <Text style={styles.moveBadgeUpText}>▲ {row.movement}</Text>
      </View>
    );
  }
  if (row.has_negative_movement && row.movement != null && row.movement < 0) {
    return (
      <View style={styles.moveBadgeDown}>
        <Text style={styles.moveBadgeDownText}>▼ {Math.abs(row.movement)}</Text>
      </View>
    );
  }
  return <Text style={styles.moveSame}>—</Text>;
}

function ChartRowCard({
  row,
  onPress,
}: {
  row: ChartRankingRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chartCard,
        pressed && { opacity: 0.78 },
      ]}
    >
      <Text style={[styles.chartCardRank, row.is_number_one && styles.chartCardRankGold]}>
        {row.rank}
      </Text>
      {row.image ? (
        <Image source={{ uri: row.image }} style={styles.chartCardArt} />
      ) : (
        <View style={[styles.chartCardArt, styles.chartCardArtPlaceholder]}>
          <Text style={styles.albumPlaceholderIcon}>♪</Text>
        </View>
      )}
      <View style={styles.chartCardMeta}>
        <Text style={styles.chartCardTitle} numberOfLines={1}>{row.name}</Text>
        {row.artist_name ? (
          <Text style={styles.chartCardArtist} numberOfLines={1}>{row.artist_name}</Text>
        ) : null}
      </View>
      <View style={styles.chartCardRight}>
        <MovementBadge row={row} />
        <Text style={styles.chartCardPlays}>{row.play_count} plays</Text>
        <Text style={styles.chartCardStreak}>
          streak {row.weeks_in_top_10}
          {row.weeks_at_1 > 0 ? ` (${row.weeks_at_1})` : " (0)"}
        </Text>
      </View>
    </Pressable>
  );
}

function MoverCard({
  label,
  mover,
  onPress,
}: {
  label: string;
  mover: ChartMoverEntry;
  onPress?: () => void;
}) {
  if (!mover) return null;

  const isOut = isDropout(mover);
  const movement = isOut ? mover.movement : mover.movement;
  const movAbs = movement != null ? Math.abs(movement) : null;
  const movStr = movAbs != null && movAbs > 0
    ? (isOut || (movement != null && movement < 0) ? `↓ ${movAbs}` : `↑ ${movAbs}`)
    : null;
  const isNew = !isOut && (mover as ChartRankingRow).is_new;
  const subtitle = isOut
    ? `Was #${mover.prev_rank} · left the chart`
    : isNew
    ? "New"
    : movStr ?? "—";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.moverCard,
        pressed && { opacity: 0.78 },
      ]}
    >
      <Text style={styles.moverLabel}>{label}</Text>
      <Text style={styles.moverName} numberOfLines={2}>{mover.name}</Text>
      <Text style={styles.moverSubtitle}>{subtitle}</Text>
      {isNew ? (
        <View style={[styles.newBadge, { marginTop: 8 }]}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      ) : movStr ? (
        <View style={[styles.moveBadgeDown, { marginTop: 8 }]}>
          <Text style={styles.moveBadgeDownText}>{movStr}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function BillboardTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { data: chart, isLoading } = useWeeklyChart("tracks");
  const [showMore, setShowMore] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  if (!chart || chart.rankings.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>
            No weekly chart yet. Billboard updates every Sunday after you've logged listens.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const sorted = [...chart.rankings].sort((a, b) => a.rank - b.rank);
  const hero = sorted[0] ?? null;
  const spots2to5 = sorted.filter((r) => r.rank >= 2 && r.rank <= 5);
  const spots6to10 = sorted.filter((r) => r.rank >= 6);
  const weekLabel = chart.share?.weekLabel ?? chart.chart_moment?.week_label ?? "";
  const { biggest_jump, biggest_drop, best_new_entry } = chart.movers;

  const navigateToEntity = (row: ChartRankingRow | null) => {
    if (!row) return;
    router.push(`/song/${row.entity_id}` as const);
  };

  const handleShare = () => {
    void Share.share({
      message: `My #1 this week: ${hero?.name ?? ""}${hero?.artist_name ? ` by ${hero.artist_name}` : ""} — ${weekLabel}`,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* #1 Hero */}
      {hero ? (
        <Pressable
          onPress={() => navigateToEntity(hero)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.heroCard,
            pressed && { opacity: 0.82 },
          ]}
        >
          <View style={styles.heroInner}>
            {hero.image ? (
              <Image source={{ uri: hero.image }} style={styles.heroArt} />
            ) : (
              <View style={[styles.heroArt, styles.chartCardArtPlaceholder]}>
                <Text style={{ fontSize: 28, color: theme.colors.muted }}>♪</Text>
              </View>
            )}
            <View style={styles.heroMeta}>
              <Text style={styles.heroRank}>#1</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{hero.name}</Text>
              {hero.artist_name ? (
                <Text style={styles.heroArtist} numberOfLines={1}>{hero.artist_name}</Text>
              ) : null}
              <Text style={styles.heroPlays}>{hero.play_count} plays</Text>
            </View>
            {hero.is_new || hero.is_reentry ? (
              <View style={[styles.newBadge, { alignSelf: "flex-start" }]}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            ) : hero.weeks_at_1 > 1 ? (
              <View style={[styles.newBadge, { alignSelf: "flex-start", backgroundColor: "#854d0e" }]}>
                <Text style={styles.newBadgeText}>{hero.weeks_at_1}w at #1</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {/* THIS WEEK narrative */}
      {chart.narrative.length > 0 ? (
        <View style={styles.narrativeCard}>
          <Text style={styles.narrativeSectionLabel}>THIS WEEK</Text>
          {chart.narrative.map((line, i) => (
            <View key={i} style={styles.narrativeRow}>
              <Text style={styles.narrativeIcon}>{NARRATIVE_ICONS[i] ?? "·"}</Text>
              <Text style={styles.narrativeText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* SPOTS 2–5 */}
      {spots2to5.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.chartSectionLabel}>SPOTS 2–5</Text>
          {spots2to5.map((row) => (
            <ChartRowCard
              key={row.entity_id}
              row={row}
              onPress={() => navigateToEntity(row)}
            />
          ))}
        </View>
      ) : null}

      {/* Show spots 6-10 */}
      {spots6to10.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowMore((v) => !v)}
            style={styles.showMoreBtn}
          >
            <Text style={styles.showMoreText}>
              {showMore ? "Hide spots 6–10" : "Show spots 6–10"}
            </Text>
          </Pressable>
          {showMore ? (
            <View style={styles.section}>
              {spots6to10.map((row) => (
                <ChartRowCard
                  key={row.entity_id}
                  row={row}
                  onPress={() => navigateToEntity(row)}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {/* BIGGEST MOVERS */}
      {(biggest_jump ?? biggest_drop ?? best_new_entry) ? (
        <View style={styles.section}>
          <Text style={styles.chartSectionLabel}>BIGGEST MOVERS</Text>
          <MoverCard
            label="BIGGEST JUMP"
            mover={biggest_jump}
            onPress={() => navigateToEntity(biggest_jump as ChartRankingRow | null)}
          />
          <MoverCard
            label="BIGGEST DROP"
            mover={biggest_drop}
            onPress={() =>
              !isDropout(biggest_drop) ? navigateToEntity(biggest_drop as ChartRankingRow | null) : undefined
            }
          />
          <MoverCard
            label="BEST NEW ENTRY"
            mover={best_new_entry}
            onPress={() => navigateToEntity(best_new_entry)}
          />
        </View>
      ) : null}

      {/* Share */}
      <View style={styles.shareCard}>
        <Text style={styles.shareTitle}>Share this week</Text>
        <Text style={styles.shareDesc}>
          Export a summary or link. Anyone with the link needs to be signed in.
        </Text>
        <Pressable
          onPress={handleShare}
          style={({ pressed }: { pressed: boolean }) => [
            styles.shareBtn,
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={styles.shareBtnText}>Share your chart</Text>
        </Pressable>
        <Text style={styles.quickActionsLabel}>QUICK ACTIONS</Text>
        <View style={styles.quickActionsRow}>
          <Pressable onPress={handleShare} style={styles.quickBtn}>
            <Text style={styles.quickBtnText}>⇡ Share</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const summary = sorted
                .slice(0, 5)
                .map((r, i) => `${i + 1}. ${r.name}${r.artist_name ? ` – ${r.artist_name}` : ""}`)
                .join("\n");
              void Share.share({ message: `My Billboard ${weekLabel}\n\n${summary}` });
            }}
            style={styles.quickBtn}
          >
            <Text style={styles.quickBtnText}>⧉ Copy summary</Text>
          </Pressable>
        </View>
      </View>
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
                    {pulse.playVolume.percentChange > 0 ? "+" : ""}{Math.round(pulse.playVolume.percentChange)}% vs last week · {pulse.playVolume.currentPlays.toLocaleString()} plays
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
    paddingBottom: 6,
    paddingTop: 4,
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
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
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
  emptySection: {
    paddingVertical: 32,
    alignItems: "center",
  },
  rangeLabel: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: "600",
    marginBottom: 4,
  },
  // Legacy chart row styles (kept for PulseTab top tracks)
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
  },
  // ─── Billboard redesign styles ───────────────────────────────────────────────
  chartSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: theme.colors.muted,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  // Hero (#1) card
  heroCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  heroArt: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  heroMeta: {
    flex: 1,
    gap: 3,
  },
  heroRank: {
    fontSize: 11,
    fontWeight: "800",
    color: "#f59e0b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    lineHeight: 22,
  },
  heroArtist: {
    fontSize: 13,
    color: "#d4d4d8",
  },
  heroPlays: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 2,
  },
  // Narrative card
  narrativeCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  narrativeSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: theme.colors.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  narrativeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  narrativeIcon: {
    fontSize: 15,
    color: theme.colors.muted,
    width: 18,
    textAlign: "center",
    marginTop: 1,
  },
  narrativeText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  // Chart row card (spots 2-10)
  chartCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.panel,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
  },
  chartCardRank: {
    width: 28,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.muted,
    flexShrink: 0,
  },
  chartCardRankGold: {
    color: "#f59e0b",
  },
  chartCardArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  chartCardArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  chartCardMeta: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  chartCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  chartCardArtist: {
    fontSize: 13,
    color: "#d4d4d8",
  },
  chartCardRight: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  chartCardPlays: {
    fontSize: 12,
    color: theme.colors.muted,
    textAlign: "right",
  },
  chartCardStreak: {
    fontSize: 11,
    color: theme.colors.muted,
    textAlign: "right",
  },
  // Movement badges
  newBadge: {
    backgroundColor: "rgba(30, 58, 138, 0.85)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#93c5fd",
    letterSpacing: 0.5,
  },
  moveBadgeUp: {
    backgroundColor: "rgba(6, 78, 59, 0.7)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  moveBadgeUpText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  moveBadgeDown: {
    backgroundColor: "rgba(127, 29, 29, 0.5)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  moveBadgeDownText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f87171",
  },
  moveSame: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  // Show more button
  showMoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 4,
  },
  showMoreText: {
    fontSize: 14,
    color: theme.colors.muted,
    fontWeight: "500",
  },
  // Mover cards
  moverCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 10,
  },
  moverLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: theme.colors.muted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  moverName: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
    lineHeight: 24,
  },
  moverSubtitle: {
    fontSize: 13,
    color: theme.colors.muted,
    marginTop: 4,
  },
  // Share card
  shareCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 20,
    marginTop: 8,
  },
  shareTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 6,
  },
  shareDesc: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
    marginBottom: 18,
  },
  shareBtn: {
    backgroundColor: theme.colors.emerald,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#000",
  },
  quickActionsLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: theme.colors.muted,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: theme.colors.active,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
});
