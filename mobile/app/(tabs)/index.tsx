import { useState, useCallback, useEffect, useRef } from "react";
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
  useHomeTasteTimeline,
  useHomeTasteInsights,
  type TimelineMonth,
  type TasteInsightsData,
} from "@/lib/hooks/useHomeHistory";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";

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
      {tab === "activity" && <ActivityTab />}
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
        <View style={styles.billboardNarrCard}>
          <Text style={styles.narrativeSectionLabel}>THIS WEEK</Text>
          {chart.narrative.map((line, i) => (
            <View key={i} style={styles.narrativeRow}>
              <Text style={styles.narrativeIcon}>{NARRATIVE_ICONS[i] ?? "·"}</Text>
              <Text style={styles.billboardNarrText}>{line}</Text>
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

// ─── Pulse Tab ─────────────────────────────────────────────────────────────────

function PulseArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  const color = trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : "#71717a";
  const symbol = trend === "up" ? "↑" : trend === "down" ? "↓" : "↔";
  return (
    <View style={styles.pulseArrowBox}>
      <Text style={[styles.pulseArrowText, { color }]}>{symbol}</Text>
    </View>
  );
}

function PulseTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { data: billboard, isLoading: billboardLoading } = useHomeBillboard();
  const { data: pulse, isLoading: pulseLoading } = useHomePulse();

  if (billboardLoading || pulseLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const weeklyTop = billboard?.weeklyTop;
  const narrative = billboard?.narrative;
  const artists = weeklyTop?.artists.slice(0, 12) ?? [];
  const albums = weeklyTop?.albums.slice(0, 12) ?? [];
  const hasTopContent = artists.length > 0 || albums.length > 0;

  const hasWeekly = !!(pulse?.playVolume ?? pulse?.genreChange ?? pulse?.artistChange);
  const hasBody = hasWeekly || !!(pulse?.discoveries) || !!(pulse?.soundShift);
  const soundNeedsRule = !!(pulse?.soundShift) && (hasWeekly || !!(pulse?.discoveries));

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Narrative lede */}
      {narrative ? (
        <View style={styles.narrativeCard}>
          <Text style={styles.narrativeText}>{narrative}</Text>
        </View>
      ) : null}

      {/* Top artists & albums */}
      {hasTopContent ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Top artists & albums</Text>
              {weeklyTop?.rangeLabel ? (
                <Text style={styles.sectionDesc}>
                  {weeklyTop.rangeLabel} · your most-played artists and albums this week.
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {}}
              style={({ pressed }: { pressed: boolean }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.sectionAction}>Weekly report →</Text>
            </Pressable>
          </View>

          {artists.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.pulseSubLabel}>Top artists</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
                {artists.map((a: TopArtistItem) => (
                  <Pressable
                    key={a.artistId}
                    style={({ pressed }: { pressed: boolean }) => [styles.pulseArtistCard, pressed && { opacity: 0.75 }]}
                    onPress={() => router.push(`/artist/${a.artistId}` as const)}
                  >
                    <View style={styles.pulseArtistImgWrap}>
                      {a.imageUrl ? (
                        <Image source={{ uri: a.imageUrl }} style={styles.pulseArtistImg} />
                      ) : (
                        <Text style={styles.pulseArtistInitial}>{(a.name[0] ?? "?").toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.pulseArtistName} numberOfLines={2}>{a.name}</Text>
                    <Text style={styles.pulseArtistPlays}>{a.playCount} plays</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {albums.length > 0 ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.pulseSubLabel}>Top albums</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
                {albums.map((al: TopAlbumItem) => (
                  <Pressable
                    key={al.albumId}
                    style={({ pressed }: { pressed: boolean }) => [styles.pulseAlbumCard, pressed && { opacity: 0.75 }]}
                    onPress={() => router.push(`/album/${al.albumId}` as const)}
                  >
                    <View style={styles.pulseAlbumArtWrap}>
                      {al.imageUrl ? (
                        <Image source={{ uri: al.imageUrl }} style={styles.pulseAlbumArt} />
                      ) : (
                        <Text style={styles.albumPlaceholderIcon}>♪</Text>
                      )}
                    </View>
                    <View style={{ minWidth: 0 }}>
                      <Text style={styles.pulseAlbumName} numberOfLines={2}>{al.name}</Text>
                      <Text style={styles.pulseAlbumArtist} numberOfLines={1}>{al.artistName}</Text>
                      <Text style={styles.pulseArtistPlays}>{al.playCount} plays</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Pulse section */}
      {pulse && hasBody ? (
        <View style={styles.section}>
          <View style={{ gap: 4 }}>
            <Text style={styles.sectionTitle}>Pulse</Text>
            <Text style={styles.pulseCaption}>{pulse.rangeCaption}</Text>
          </View>
          <View style={styles.pulseCard}>
            {/* This week vs last week */}
            {hasWeekly ? (
              <View style={styles.pulseGroup}>
                <Text style={styles.pulseGroupLabel}>THIS WEEK VS LAST WEEK</Text>
                <View style={[styles.pulseGroupItems, { borderBottomWidth: (pulse.discoveries || pulse.soundShift) ? StyleSheet.hairlineWidth : 0, borderBottomColor: "rgba(63,63,70,0.8)", paddingBottom: (pulse.discoveries || pulse.soundShift) ? 20 : 0 }]}>
                  {pulse.playVolume ? (
                    <View style={styles.pulseRow}>
                      <PulseArrow trend={pulse.playVolume.trend} />
                      <View style={styles.pulseRowText}>
                        <Text style={styles.pulseLabel}>How much you're listening</Text>
                        <Text style={styles.pulseMeta}>
                          {pulse.playVolume.percentChange > 0 ? "+" : ""}{Math.round(pulse.playVolume.percentChange)}% vs last week
                          {" · "}<Text style={{ color: "#d4d4d8" }}>{pulse.playVolume.currentPlays.toLocaleString()} plays</Text>
                          {" vs "}<Text style={{ color: "#71717a" }}>{pulse.playVolume.previousPlays.toLocaleString()}</Text>
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {pulse.genreChange ? (
                    <View style={styles.pulseRow}>
                      <PulseArrow trend={pulse.genreChange.trend} />
                      <View style={styles.pulseRowText}>
                        <Text style={styles.pulseLabel}>Top genre this week</Text>
                        <Text style={styles.pulseName}>{pulse.genreChange.name}</Text>
                        <Text style={styles.pulseMeta}>{pulse.genreChange.caption}</Text>
                      </View>
                    </View>
                  ) : null}
                  {pulse.artistChange ? (
                    <View style={styles.pulseRow}>
                      <PulseArrow trend={pulse.artistChange.trend} />
                      <View style={styles.pulseRowText}>
                        <Text style={styles.pulseLabel}>Top artist this week</Text>
                        <Text style={styles.pulseName}>{pulse.artistChange.name}</Text>
                        <Text style={styles.pulseMeta}>{pulse.artistChange.caption}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* New additions */}
            {pulse.discoveries ? (
              <View style={styles.pulseGroup}>
                <Text style={styles.pulseGroupLabel}>NEW ADDITIONS</Text>
                <View style={styles.pulseRow}>
                  <View style={[styles.pulseArrowBox, { backgroundColor: "transparent" }]}>
                    <Text style={{ fontSize: 18, color: "#a78bfa" }}>+</Text>
                  </View>
                  <View style={styles.pulseRowText}>
                    <Text style={styles.pulseLabel}>Artists you just found</Text>
                    <Text style={styles.pulseMeta}>New artists you've added to your rotation this week.</Text>
                    <Text style={[styles.pulseName, { marginTop: 8 }]}>
                      {pulse.discoveries.names.slice(0, 4).join(" · ")}
                      {pulse.discoveries.names.length > 4 ? ` · +${pulse.discoveries.names.length - 4} more` : ""}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* What's changing */}
            {pulse.soundShift ? (
              <View style={[styles.pulseGroup, soundNeedsRule && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(63,63,70,0.8)", paddingTop: 20 }]}>
                <Text style={styles.pulseGroupLabel}>WHAT'S CHANGING</Text>
                <View style={styles.pulseRow}>
                  <PulseArrow trend={pulse.soundShift.trend} />
                  <View style={styles.pulseRowText}>
                    <Text style={styles.pulseLabel}>{pulse.soundShift.headline}</Text>
                    <Text style={styles.pulseMeta}>{pulse.soundShift.detail}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── Taste Timeline (matches web TasteTimeline) ────────────────────────────────

const TL_PREVIEW = 6;

function ArtistAvatarStack({ artists }: { artists: TimelineMonth["topArtists"] }) {
  return (
    <View style={styles.avatarStack}>
      {artists.slice(0, 4).map((a, i) => (
        <View
          key={a.id}
          style={[styles.avatarStackItem, { marginLeft: i === 0 ? 0 : -9, zIndex: 4 - i }]}
        >
          {a.imageUrl ? (
            <Image source={{ uri: a.imageUrl }} style={styles.avatarStackImg} />
          ) : (
            <View style={[styles.avatarStackImg, styles.avatarStackFallback]}>
              <Text style={styles.avatarStackInitial}>{(a.name[0] ?? "?").toUpperCase()}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function GenrePillsRow({ genres }: { genres: TimelineMonth["topGenres"] }) {
  if (genres.length === 0) return <Text style={styles.tlDash}>—</Text>;
  return (
    <View style={styles.genrePillRow}>
      {genres.slice(0, 3).map((g) => (
        <View key={g.name} style={styles.genrePill}>
          <Text style={styles.genrePillText}>{g.name}</Text>
        </View>
      ))}
    </View>
  );
}

function TasteTimeline({ months, shifts }: { months: TimelineMonth[]; shifts: Array<"major" | "minor" | null> }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? months : months.slice(0, TL_PREVIEW);
  const hasMore = months.length > TL_PREVIEW;

  return (
    <View>
      {/* Header row */}
      <View style={[styles.tlRow, styles.tlHeaderRow]}>
        <Text style={[styles.tlMonthCell, styles.tlHeaderText]}>MONTH</Text>
        <View style={styles.tlArtistCell}><Text style={styles.tlHeaderText}>ARTISTS</Text></View>
        <View style={styles.tlGenreCell}><Text style={styles.tlHeaderText}>GENRES</Text></View>
        <Text style={[styles.tlPlaysCell, styles.tlHeaderText]}>PLAYS</Text>
      </View>
      {visible.map((entry, i) => (
        <View key={entry.month}>
          <View style={styles.tlRow}>
            <Text style={styles.tlMonthCell} numberOfLines={2}>{entry.monthLabel}</Text>
            <View style={styles.tlArtistCell}>
              <ArtistAvatarStack artists={entry.topArtists} />
            </View>
            <View style={styles.tlGenreCell}>
              <GenrePillsRow genres={entry.topGenres} />
            </View>
            <Text style={styles.tlPlaysCell}>{entry.totalLogs.toLocaleString()}</Text>
          </View>
          {shifts[i] === "major" ? (
            <View style={styles.shiftMajorRow}>
              <View style={styles.shiftLine} />
              <View style={styles.shiftMajorBadge}>
                <Text style={styles.shiftMajorText}>GENRE SHIFT</Text>
              </View>
              <View style={styles.shiftLine} />
            </View>
          ) : shifts[i] === "minor" ? (
            <View style={styles.shiftMinorRow}>
              <View style={styles.shiftLineMinor} />
              <Text style={styles.shiftMinorText}>change</Text>
              <View style={styles.shiftLineMinor} />
            </View>
          ) : null}
        </View>
      ))}
      {hasMore && (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          style={({ pressed }: { pressed: boolean }) => [styles.tlShowMore, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.tlShowMoreText}>
            {showAll ? "Show less" : `Show all ${months.length} months`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Insight Cards (matches web ProfileInsightCards) ──────────────────────────

const KIND_LABEL: Record<string, string> = {
  shifting: "Shifting", exploring: "Exploring", stable: "Stable",
  deepening: "Going deep", "deep-diver": "Deep diver",
  "steady-explorer": "Steady explorer", skimmer: "Skimmer",
  loyal: "Loyal listener", underground: "Underground",
  "indie-leaning": "Indie-leaning", mainstream: "Mainstream",
  balanced: "Balanced", "genre-fluid": "Genre-fluid",
  "genre-curious": "Genre-curious", focused: "Focused",
};

const KIND_BG: Record<string, string> = {
  shifting: "rgba(14,165,233,0.15)", exploring: "rgba(139,92,246,0.15)",
  stable: "rgba(16,185,129,0.15)", deepening: "rgba(16,185,129,0.15)",
  "deep-diver": "rgba(139,92,246,0.15)", "steady-explorer": "rgba(14,165,233,0.15)",
  skimmer: "rgba(245,158,11,0.15)", loyal: "rgba(63,63,70,0.4)",
  underground: "rgba(139,92,246,0.15)", "indie-leaning": "rgba(14,165,233,0.15)",
  mainstream: "rgba(63,63,70,0.4)", balanced: "rgba(63,63,70,0.4)",
  "genre-fluid": "rgba(16,185,129,0.15)", "genre-curious": "rgba(14,165,233,0.15)",
  focused: "rgba(63,63,70,0.4)",
};

const KIND_TEXT: Record<string, string> = {
  shifting: "#38bdf8", exploring: "#a78bfa", stable: "#34d399",
  deepening: "#34d399", "deep-diver": "#a78bfa", "steady-explorer": "#38bdf8",
  skimmer: "#fbbf24", loyal: "#a1a1aa", underground: "#a78bfa",
  "indie-leaning": "#38bdf8", mainstream: "#a1a1aa", balanced: "#a1a1aa",
  "genre-fluid": "#34d399", "genre-curious": "#38bdf8", focused: "#a1a1aa",
};

function KindBadge({ kind }: { kind: string }) {
  const bg = KIND_BG[kind] ?? "rgba(63,63,70,0.4)";
  const color = KIND_TEXT[kind] ?? "#a1a1aa";
  return (
    <View style={[styles.kindBadge, { backgroundColor: bg }]}>
      <Text style={[styles.kindBadgeText, { color }]}>{KIND_LABEL[kind] ?? kind}</Text>
    </View>
  );
}

function InsightCard({
  label,
  kind,
  narrative,
  chips,
  chipsLabel,
}: {
  label: string;
  kind: string;
  narrative: string;
  chips?: { id: string; name: string }[];
  chipsLabel?: string;
}) {
  if (kind === "insufficient") return null;
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightCardHeader}>
        <Text style={styles.insightCardLabel}>{label.toUpperCase()}</Text>
        <KindBadge kind={kind} />
      </View>
      <Text style={styles.insightCardNarrative}>{narrative}</Text>
      {chips && chips.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          {chipsLabel ? <Text style={styles.insightChipsLabel}>{chipsLabel}</Text> : null}
          <View style={styles.insightChipsRow}>
            {chips.map((a) => (
              <View key={a.id} style={styles.insightChip}>
                <Text style={styles.insightChipText}>{a.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function InsightCards({ data }: { data: TasteInsightsData }) {
  if (!data) return null;
  const { arc, discovery, taste } = data;

  let signature: { traits: string[]; narrative: string } | null = null;
  if (taste && taste.totalLogs >= 20) {
    const obs = taste.obscurityScore ?? 50;
    const div = taste.diversityScore ?? 5;
    const traits: string[] = [];
    const parts: string[] = [];
    if (obs >= 70) { traits.push("underground"); parts.push("You love discovering artists most people have never heard of"); }
    else if (obs >= 50) { traits.push("indie-leaning"); parts.push("You mix some popular music with lesser-known artists"); }
    else if (obs <= 25) { traits.push("mainstream"); parts.push("You're into popular music — you love what people are talking about"); }
    else { traits.push("balanced"); parts.push("You enjoy both popular hits and more underground finds"); }
    if (div >= 8) { traits.push("genre-fluid"); parts.push("and cut across a wide range of genres"); }
    else if (div >= 5) { traits.push("genre-curious"); parts.push("and move comfortably across several genres"); }
    else { traits.push("focused"); parts.push("and stay in a focused lane"); }
    const topGenre = taste.topGenres?.[0]?.name;
    if (topGenre) parts.push(`with ${topGenre} as your go-to`);
    const raw = parts.join(" ") + ".";
    signature = { traits, narrative: raw.charAt(0).toUpperCase() + raw.slice(1) };
  }

  const showArc = arc.kind !== "insufficient";
  const showDisc = discovery.kind !== "insufficient";
  if (!showArc && !showDisc && !signature) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Listening insights</Text>
      <View style={{ gap: 10 }}>
        {showArc && (
          <InsightCard
            label="Taste arc"
            kind={arc.kind}
            narrative={arc.narrative}
            chips={arc.risingArtists}
            chipsLabel="New in rotation"
          />
        )}
        {showDisc && (
          <InsightCard
            label="How you discover"
            kind={discovery.kind}
            narrative={discovery.narrative}
            chips={discovery.recentFinds}
            chipsLabel="Recent finds"
          />
        )}
        {signature && (
          <InsightCard
            label="Your sound"
            kind={signature.traits[0] ?? "balanced"}
            narrative={signature.narrative}
            chips={signature.traits.slice(1).map((t) => ({ id: t, name: KIND_LABEL[t] ?? t }))}
          />
        )}
      </View>
    </View>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: blindSpots, isLoading: bsLoading } = useHomeBlindSpots();
  const { data: report, isLoading: reportLoading } = useHomeListeningReport();
  const { data: timeline, isLoading: timelineLoading } = useHomeTasteTimeline();
  const { data: insights, isLoading: insightsLoading } = useHomeTasteInsights();

  if (bsLoading || reportLoading || timelineLoading || insightsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const hasTimeline = timeline?.hasData && (timeline.months?.length ?? 0) > 0;
  const hasBlindSpots = blindSpots?.hasData && (blindSpots.artists?.length ?? 0) > 0;
  const hasReport = report && (report.topArtists?.length ?? 0) > 0;

  if (!hasTimeline && !hasBlindSpots && !hasReport) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Log more listens to see your history insights here.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Taste over time */}
      {hasTimeline ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Taste over time</Text>
          <TasteTimeline months={timeline!.months} shifts={timeline!.shifts} />
        </View>
      ) : null}

      {/* Blind spots */}
      {hasBlindSpots ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blind spots</Text>
          <View style={styles.blindSpotsCard}>
            <View style={styles.blindSpotsHeader}>
              <Text style={styles.blindSpotsLabel}>ARTISTS YOU MIGHT LIKE</Text>
              <View style={styles.blindSpotsBadge}>
                <Text style={styles.blindSpotsBadgeText}>Similar to your favorites</Text>
              </View>
            </View>
            <Text style={styles.blindSpotsIntro}>
              Similar to artists you love, but you haven't listened to them yet.
            </Text>
            {blindSpots!.artists.slice(0, 5).map((a) => (
              <View key={a.spotifyId} style={styles.blindSpotItem}>
                <View style={styles.blindSpotAvatar}>
                  {a.imageUrl ? (
                    <Image source={{ uri: a.imageUrl }} style={styles.blindSpotAvatarImg} />
                  ) : (
                    <Text style={styles.blindSpotAvatarInitial}>{(a.name[0] ?? "?").toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.blindSpotItemMeta}>
                  <Text style={styles.blindSpotName} numberOfLines={1}>{a.name}</Text>
                  {a.becauseOf.length > 0 ? (
                    <Text style={styles.blindSpotSimilar} numberOfLines={1}>
                      {"Similar to "}
                      <Text style={{ color: "#a1a1aa" }}>{a.becauseOf.slice(0, 2).join(" · ")}</Text>
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Listening report */}
      {hasReport ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Listening report</Text>
            <Pressable
              style={({ pressed }: { pressed: boolean }) => [pressed && { opacity: 0.6 }]}
              onPress={() => {/* navigate to /reports/listening when implemented */}}
            >
              <Text style={styles.sectionAction}>Full report →</Text>
            </Pressable>
          </View>
          <View style={[styles.card, { paddingVertical: 16 }]}>
            <Text style={styles.reportPeriod}>{report!.periodLabel}</Text>
            <View style={{ marginTop: 14, gap: 8 }}>
              {report!.topArtists.slice(0, 5).map((a, i) => (
                <View key={a.name} style={styles.reportRow}>
                  <Text style={styles.reportRank}>{i + 1}</Text>
                  {a.image ? (
                    <Image source={{ uri: a.image }} style={styles.reportArtImg} />
                  ) : (
                    <View style={[styles.reportArtImg, styles.reportArtPlaceholder]}>
                      <Text style={styles.reportArtIcon}>♪</Text>
                    </View>
                  )}
                  <Text style={styles.reportArtistName} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.reportCount}>{a.count} plays</Text>
                </View>
              ))}
            </View>
            {report!.topGenre ? (
              <Text style={styles.reportTopGenre}>
                {"Top genre: "}
                <Text style={{ color: "#d4d4d8", textTransform: "capitalize" }}>{report!.topGenre.name}</Text>
                {` · ${report!.topGenre.count} plays`}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Listening insights */}
      <InsightCards data={insights ?? null} />
    </ScrollView>
  );
}

// ─── Activity Tab ──────────────────────────────────────────────────────────────

const ACTIVITY_PAGE_SIZE = 20;

type RecentTrack = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

function ActivityTab() {
  const [items, setItems] = useState<RecentTrack[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const stateRef = useRef({ hasMore: true, loadingMore: false, count: 0 });
  stateRef.current = { hasMore, loadingMore, count: items.length };

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await fetcher<{ items: RecentTrack[]; hasMore: boolean }>(
        `/api/spotify/recently-played?limit=${ACTIVITY_PAGE_SIZE}&offset=${offset}`,
      );
      setItems((prev) => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []));
      setHasMore(data.hasMore ?? false);
    } catch {
      if (!append) setItems([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPage(0, false); }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (stateRef.current.hasMore && !stateRef.current.loadingMore) {
      void fetchPage(stateRef.current.count, true);
    }
  }, [fetchPage]);

  if (loading) {
    return (
      <ScrollView
        contentContainerStyle={styles.tabContent}
        showsVerticalScrollIndicator={false}
        pointerEvents="none"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={styles.activitySkeleton} />
        ))}
      </ScrollView>
    );
  }

  return (
    <FlatList<RecentTrack>
      data={items}
      keyExtractor={(t) => `${t.track_id}-${t.played_at}`}
      renderItem={({ item: t }) => (
        <View style={styles.activityRow}>
          {t.album_image ? (
            <Image source={{ uri: t.album_image }} style={styles.activityArt} />
          ) : (
            <View style={[styles.activityArt, styles.activityArtPlaceholder]}>
              <Text style={styles.activityArtIcon}>♪</Text>
            </View>
          )}
          <View style={styles.activityMeta}>
            <Text style={styles.activityTitle} numberOfLines={1}>{t.track_name}</Text>
            <Text style={styles.activitySub} numberOfLines={1}>
              {t.artist_name}{t.album_name ? ` · ${t.album_name}` : ""}
            </Text>
          </View>
          <Text style={styles.activityDate}>
            {new Date(t.played_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
        </View>
      )}
      ItemSeparatorComponent={null}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No recent listens yet. Log listens, sync Last.fm, or connect Spotify to see tracks here.
          </Text>
        </View>
      }
      ListFooterComponent={loadingMore ? (
        <View style={styles.activityFooter}>
          <ActivityIndicator size="small" color={theme.colors.muted} />
        </View>
      ) : null}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      contentContainerStyle={[styles.tabContent, { gap: 6 }]}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── TabButton (underline style, matches web) ──────────────────────────────────

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
        styles.tabBtn,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.tabBtnLabel, active ? styles.tabBtnLabelActive : styles.tabBtnLabelIdle]}>
        {label}
      </Text>
      {active && <View style={styles.tabUnderline} />}
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
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "relative",
    alignItems: "center",
  },
  tabBtnLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  tabBtnLabelActive: {
    color: theme.colors.text,
  },
  tabBtnLabelIdle: {
    color: theme.colors.muted,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#34d399",
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 28,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  // Narrative
  narrativeCard: {
    backgroundColor: "rgba(24,24,27,0.62)",
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  narrativeText: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#d4d4d8",
    lineHeight: 23,
  },
  // Sections
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    letterSpacing: -0.3,
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
  // ─── Pulse artist cards (web: min(38vw,132px), 88px circle) ────────────────
  pulseSubLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: "#e4e4e7",
  },
  pulseArtistCard: {
    width: 130,
    alignItems: "center",
    gap: 8,
    marginRight: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(24,24,27,0.62)",
  },
  pulseArtistImgWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#27272a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(161,161,170,0.3)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseArtistImg: {
    width: 88,
    height: 88,
  },
  pulseArtistInitial: {
    fontSize: 28,
    fontWeight: "600",
    color: "#52525b",
  },
  pulseArtistName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    textAlign: "center",
    lineHeight: 18,
  },
  pulseArtistPlays: {
    fontSize: 11,
    color: "#52525b",
  },
  // ─── Pulse album cards (web: min(46vw,168px), square art) ───────────────────
  pulseAlbumCard: {
    width: 156,
    gap: 8,
    marginRight: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(24,24,27,0.62)",
  },
  pulseAlbumArtWrap: {
    width: 132,
    height: 132,
    borderRadius: 8,
    backgroundColor: "#27272a",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseAlbumArt: {
    width: 132,
    height: 132,
  },
  pulseAlbumName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    lineHeight: 18,
  },
  pulseAlbumArtist: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 2,
  },
  // keep for billboard placeholder
  albumPlaceholderIcon: {
    fontSize: 28,
    color: theme.colors.muted,
  },
  playCount: {
    fontSize: 11,
    color: "#52525B",
  },
  // ─── Pulse stats card ─────────────────────────────────────────────────────
  pulseCaption: {
    fontSize: 13,
    color: theme.colors.muted,
  },
  pulseCard: {
    backgroundColor: "rgba(24,24,27,0.62)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 20,
  },
  pulseGroup: {
    gap: 12,
  },
  pulseGroupLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: "#71717a",
    textTransform: "uppercase",
  },
  pulseGroupItems: {
    gap: 16,
  },
  pulseRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  pulseArrowBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  pulseArrowText: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  pulseRowText: {
    flex: 1,
    gap: 2,
  },
  pulseLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.text,
  },
  pulseName: {
    fontSize: 14,
    color: "#e4e4e7",
  },
  pulseMeta: {
    fontSize: 13,
    color: "#71717a",
    lineHeight: 18,
  },
  sectionDesc: {
    fontSize: 13,
    color: theme.colors.muted,
    marginTop: 3,
    lineHeight: 18,
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
    gap: 12,
    paddingVertical: 6,
  },
  reportArtistName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    flex: 1,
  },
  reportCount: {
    fontSize: 12,
    color: theme.colors.muted,
    flexShrink: 0,
  },
  // ─── Section header with action ─────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(52,211,153,0.95)",
  },
  // ─── Insight Cards ───────────────────────────────────────────────────────────
  insightCard: {
    backgroundColor: "rgba(9,9,11,0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.7)",
    padding: 16,
  },
  insightCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  insightCardLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    color: theme.colors.muted,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  insightCardNarrative: {
    fontSize: 14,
    color: "#e4e4e7",
    lineHeight: 20,
    marginTop: 10,
  },
  insightChipsLabel: {
    fontSize: 10,
    color: "#52525B",
    marginBottom: 6,
  },
  insightChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  insightChip: {
    backgroundColor: "rgba(39,39,42,0.6)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  insightChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#d4d4d8",
  },
  kindBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // ─── Taste Timeline ─────────────────────────────────────────────────────────
  // No card wrapper — sits directly on page background, like the web
  tlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(63,63,70,0.6)",
  },
  tlHeaderRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(63,63,70,0.6)",
  },
  tlHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#52525B",
    textTransform: "uppercase",
  },
  tlMonthCell: {
    width: 52,
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.muted,
    flexShrink: 0,
  },
  tlArtistCell: {
    width: 90,
    flexShrink: 0,
  },
  tlGenreCell: {
    flex: 1,
    minWidth: 0,
  },
  tlPlaysCell: {
    width: 42,
    textAlign: "right",
    fontSize: 11,
    color: "#52525B",
    flexShrink: 0,
  },
  tlDash: {
    fontSize: 11,
    color: "#52525B",
  },
  tlShowMore: {
    alignItems: "center",
    paddingVertical: 14,
  },
  tlShowMoreText: {
    fontSize: 13,
    color: theme.colors.muted,
    fontWeight: "500",
  },
  // Avatar stack — 28px circles with 2px zinc-950 ring, matching web
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarStackItem: {
    borderRadius: 15,
    borderWidth: 2,
    borderColor: theme.colors.bg,
  },
  avatarStackImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarStackFallback: {
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStackInitial: {
    fontSize: 10,
    fontWeight: "600",
    color: "#a1a1aa",
  },
  // Genre pills row
  genrePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  genrePill: {
    backgroundColor: "rgba(39,39,42,0.6)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
  },
  genrePillText: {
    fontSize: 11,
    color: "#a1a1aa",
  },
  // Shift dividers
  shiftMajorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  shiftMinorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    gap: 8,
  },
  shiftLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(63,63,70,0.7)",
  },
  shiftLineMinor: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(63,63,70,0.5)",
  },
  shiftMajorBadge: {
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  shiftMajorText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "rgba(245,158,11,0.8)",
    textTransform: "uppercase",
  },
  shiftMinorText: {
    fontSize: 10,
    color: "#52525B",
  },
  // ─── Blind Spots (web-matched) ───────────────────────────────────────────────
  blindSpotsCard: {
    backgroundColor: "rgba(9,9,11,0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.7)",
    padding: 16,
  },
  blindSpotsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  blindSpotsLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    color: theme.colors.muted,
    textTransform: "uppercase",
  },
  blindSpotsBadge: {
    backgroundColor: "rgba(39,39,42,0.5)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
  },
  blindSpotsBadgeText: {
    fontSize: 10,
    color: theme.colors.muted,
  },
  blindSpotsIntro: {
    fontSize: 14,
    color: "#a1a1aa",
    marginBottom: 16,
    marginTop: 4,
  },
  blindSpotItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  blindSpotAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.active,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  blindSpotAvatarImg: {
    width: 44,
    height: 44,
  },
  blindSpotAvatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  blindSpotItemMeta: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  blindSpotName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  blindSpotSimilar: {
    fontSize: 12,
    color: "#71717A",
  },
  // ─── Listening Report (web-matched) ─────────────────────────────────────────
  reportPeriod: {
    fontSize: 12,
    color: theme.colors.muted,
    paddingTop: 4,
    paddingBottom: 2,
  },
  reportRank: {
    width: 16,
    textAlign: "center",
    fontSize: 12,
    color: "#52525B",
    flexShrink: 0,
  },
  reportArtImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  reportArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  reportArtIcon: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  reportTopGenre: {
    fontSize: 12,
    color: "#71717A",
    paddingTop: 12,
    paddingBottom: 6,
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
  // Billboard narrative card (structured, with rows + icons)
  billboardNarrCard: {
    backgroundColor: "rgba(24,24,27,0.62)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
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
  billboardNarrText: {
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
  // Each row is a rounded card — matches web's rounded-xl border bg-zinc-900/40
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(39,39,42,0.5)",
    backgroundColor: "rgba(24,24,27,0.4)",
  },
  activityArt: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#27272a",
    flexShrink: 0,
  },
  activityArtPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  activityArtIcon: {
    fontSize: 16,
    color: theme.colors.muted,
  },
  activityMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
  },
  activitySub: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  activityDate: {
    fontSize: 12,
    color: theme.colors.muted,
    flexShrink: 0,
  },
  activitySkeleton: {
    height: 60,
    borderRadius: 12,
    backgroundColor: "rgba(24,24,27,0.6)",
  },
  activityFooter: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
