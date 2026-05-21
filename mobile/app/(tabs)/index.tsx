import { useState, useCallback, useEffect, useRef } from "react";
import * as FileSystem from "expo-file-system";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { BillboardChartContent } from "@/components/charts/BillboardChartContent";
import { ChartWeekSelector } from "@/components/charts/ChartWeekSelector";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useHomeBundle,
  useWeeklyChart,
  useWeeklyChartWeeks,
  type TopArtistItem,
  type TopAlbumItem,
  type TopTrackItem,
  type ChartRankingRow,
  type ChartMoverEntry,
  type ChartType,
  isDropout,
} from "@/lib/hooks/useHomeDashboard";
import {
  useHomeHistoryBundle,
  type TimelineMonth,
  type TasteInsightsData,
} from "@/lib/hooks/useHomeHistory";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";
import { usePrefetchAlbum, usePrefetchArtist } from "@/lib/hooks/usePrefetch";

type HomeTab = "billboard" | "pulse" | "history" | "activity";

export default function HomeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("billboard");
  // Fetch billboard + pulse data in a single request shared across both tabs.
  const { data: homeBundle, isLoading: bundleLoading } = useHomeBundle();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Sticky header block — logo + tabs together, matches web's sticky bar */}
      <View style={styles.stickyHeader}>
        <View style={styles.header}>
          <Text style={styles.logo}>Tracklist</Text>
        </View>
        <View style={styles.tabRow}>
          <TabChip label="Billboard" active={tab === "billboard"} onPress={() => setTab("billboard")} />
          <TabChip label="Pulse" active={tab === "pulse"} onPress={() => setTab("pulse")} />
          <TabChip label="History" active={tab === "history"} onPress={() => setTab("history")} />
          <TabChip label="Activity" active={tab === "activity"} onPress={() => setTab("activity")} />
        </View>
      </View>

      {tab === "billboard" && <BillboardTab router={router} />}
      {tab === "pulse" && <PulseTab router={router} billboard={homeBundle?.billboard ?? null} pulse={homeBundle?.pulse ?? null} isLoading={bundleLoading && !homeBundle} />}
      {tab === "history" && <HistoryTab />}
      {tab === "activity" && <ActivityTab />}
    </SafeAreaView>
  );
}

// ─── Billboard Tab — the real weekly chart ─────────────────────────────────────

const NARRATIVE_ICONS = ["✦", "↗", "↑", "·"];

const CHART_TABS: { value: ChartType; label: string }[] = [
  { value: "tracks", label: "Tracks" },
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
];

function parseIsoDate(s: string): Date {
  // Handles "YYYY-MM-DD", "YYYY-MM-DDThh:mm:ssZ", "YYYY-MM-DD hh:mm:ss+00", etc.
  const clean = s.trim().slice(0, 10); // take "YYYY-MM-DD"
  const [y, m, d] = clean.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string) => {
    const d = parseIsoDate(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  const year = parseIsoDate(weekEnd).getUTCFullYear();
  return `${fmt(weekStart)} – ${fmt(weekEnd)}, ${year}`;
}

function entityRoute(chartType: ChartType, entityId: string): string {
  if (chartType === "tracks") return `/song/${entityId}`;
  if (chartType === "artists") return `/artist/${entityId}`;
  return `/album/${entityId}`;
}

function MovementIndicator({ row }: { row: ChartRankingRow }) {
  if (row.is_new || row.is_reentry) {
    return (
      <View style={styles.newBadge}>
        <Text style={styles.newBadgeText}>{row.is_reentry ? "RE" : "NEW"}</Text>
      </View>
    );
  }
  if (row.movement == null || row.movement === 0) {
    return <Text style={styles.moveSame}>—</Text>;
  }
  if (row.movement > 0) {
    return (
      <Text style={styles.moveUp}>▲{row.movement}</Text>
    );
  }
  return (
    <Text style={styles.moveDown}>▼{Math.abs(row.movement)}</Text>
  );
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
        row.is_number_one && styles.chartCardLeader,
        pressed && { opacity: 0.82 },
      ]}
    >
      <View style={styles.chartCardInner}>
        <Text style={[styles.chartCardRank, row.rank <= 3 ? styles.chartCardRankBright : styles.chartCardRankMuted]}>
          {row.rank}
        </Text>
        {row.image ? (
          <Image source={{ uri: row.image }} style={styles.chartCardArt} />
        ) : (
          <View style={[styles.chartCardArt, styles.chartCardArtPlaceholder]}>
            <Text style={{ fontSize: 18, color: theme.colors.muted }}>—</Text>
          </View>
        )}
        <View style={styles.chartCardMeta}>
          <Text style={styles.chartCardTitle} numberOfLines={1}>{row.name}</Text>
          {row.artist_name ? (
            <Text style={styles.chartCardArtist} numberOfLines={1}>{row.artist_name}</Text>
          ) : null}
          <Text style={styles.chartCardStats}>
            {row.play_count.toLocaleString()} plays
            <Text style={styles.chartCardStatsDim}>
              {" · streak "}{row.weeks_in_top_10} ({row.weeks_at_1})
            </Text>
          </Text>
        </View>
        <View style={styles.chartCardRight}>
          <MovementIndicator row={row} />
        </View>
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
  const movAbs = mover.movement != null ? Math.abs(mover.movement) : null;
  const isNew = !isOut && (mover as ChartRankingRow).is_new;
  const movStr = movAbs != null && movAbs > 0
    ? (isOut || (mover.movement != null && mover.movement < 0) ? `▼${movAbs}` : `▲${movAbs}`)
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.moverCard, pressed && { opacity: 0.82 }]}
    >
      <Text style={styles.moverLabel}>{label}</Text>
      <Text style={styles.moverName} numberOfLines={2}>{mover.name}</Text>
      {isOut ? (
        <Text style={styles.moverSubtitle}>Was #{mover.prev_rank} · left the chart</Text>
      ) : isNew ? (
        <Text style={styles.moverSubtitle}>New</Text>
      ) : null}
      {isNew ? (
        <View style={[styles.newBadge, { marginTop: 10 }]}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      ) : movStr ? (
        <Text style={[{ marginTop: 10, fontSize: 15, fontWeight: "700" }, movStr.startsWith("▲") ? { color: "#34d399" } : { color: "#f87171" }]}>
          {movStr}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BillboardTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [chartType, setChartType] = useState<ChartType>("tracks");
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const { data: weeks } = useWeeklyChartWeeks(chartType);
  const { data: chart, isLoading } = useWeeklyChart(chartType, weekStart);

  const weeksList = weeks ?? [];
  const effectiveIndex = weekStart == null ? 0 : weeksList.findIndex(w => w.week_start === weekStart);
  const idx = effectiveIndex >= 0 ? effectiveIndex : 0;
  const currentWeek = weeksList[idx];
  const chartWeekLabel = chart?.share?.weekLabel ?? "";
  const weekLabel = currentWeek
    ? (chartWeekLabel && (weekStart == null || weekStart === currentWeek.week_start)
        ? chartWeekLabel + (idx === 0 ? " · latest" : "")
        : formatWeekRange(currentWeek.week_start, currentWeek.week_end) + (idx === 0 ? " · latest" : ""))
    : chartWeekLabel;

  function goNewer() {
    if (idx <= 0 || weeksList.length === 0) return;
    const next = idx - 1;
    setWeekStart(next === 0 ? null : weeksList[next]!.week_start);
  }
  function goOlder() {
    if (idx >= weeksList.length - 1) return;
    setWeekStart(weeksList[idx + 1]!.week_start);
  }

  const onNavigate = useCallback((entityId: string) => {
    router.push(entityRoute(chartType, entityId) as never);
  }, [router, chartType]);

  const movers = chart?.movers;
  const billboardMovers = movers ? {
    biggestMover: movers.biggest_jump ?? null,
    highestNew: movers.best_new_entry ?? null,
    dropout: movers.biggest_drop ?? null,
  } : null;

  const hero = chart ? [...chart.rankings].sort((a, b) => a.rank - b.rank)[0] ?? null : null;
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!hero || sharing) return;
    setSharing(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "";
      const params = new URLSearchParams({ type: chartType });
      if (weekStart) params.set("weekStart", weekStart);
      const imageUrl = `${apiBase}/api/charts/share-image?${params.toString()}`;

      const localUri = (FileSystem.cacheDirectory ?? "") + "tracklist-chart.png";
      await FileSystem.downloadAsync(imageUrl, localUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      await Share.share({ url: localUri });
    } catch (e) {
      // Fallback to text share if image download fails
      if (hero) {
        void Share.share({
          message: `My #1 this week: ${hero.name}${hero.artist_name ? ` by ${hero.artist_name}` : ""} — ${weekLabel}`,
        });
      }
    } finally {
      setSharing(false);
    }
  }, [hero, sharing, chartType, weekStart, weekLabel]);

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Chart type pills */}
      <View style={styles.chartTypePills}>
        {CHART_TABS.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => { setChartType(t.value); setWeekStart(null); }}
            style={({ pressed }: { pressed: boolean }) => [
              styles.chartTypePill,
              chartType === t.value ? styles.chartTypePillActive : styles.chartTypePillIdle,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.chartTypePillText, chartType === t.value ? styles.chartTypePillTextActive : styles.chartTypePillTextIdle]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Week selector — shared component */}
      <ChartWeekSelector
        weeks={weeksList}
        effectiveIndex={idx}
        disabled={weeksList.length === 0}
        onNewer={goNewer}
        onOlder={goOlder}
        onSelect={(i) => setWeekStart(i === 0 ? null : (weeksList[i]?.week_start ?? null))}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={theme.colors.emerald} />
        </View>
      ) : !chart || chart.rankings.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>
            No chart for this week yet. Billboard updates every Sunday after you've logged listens.
          </Text>
        </View>
      ) : (
        <>
          <BillboardChartContent
            weekLabel={weekLabel}
            rankings={chart.rankings}
            narrative={chart.narrative}
            narrativeLabel="THIS WEEK"
            movers={billboardMovers}
            onNavigate={onNavigate}
          />

          {/* Share */}
          <View style={styles.shareCard}>
            <Text style={styles.shareTitle}>Share this week</Text>
            <Text style={styles.shareDesc}>Export a summary or link. Anyone with the link needs to be signed in.</Text>
            <Pressable onPress={() => void handleShare()} disabled={sharing} style={({ pressed }: { pressed: boolean }) => [styles.shareBtn, (pressed || sharing) && { opacity: 0.88 }]}>
              <Text style={styles.shareBtnText}>{sharing ? "Generating…" : "Share your chart"}</Text>
            </Pressable>
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(63,63,70,0.8)", paddingTop: 20 }}>
              <Text style={styles.quickActionsLabel}>QUICK ACTIONS</Text>
              <View style={styles.quickActionsRow}>
                <Pressable onPress={() => void handleShare()} disabled={sharing} style={({ pressed }: { pressed: boolean }) => [styles.quickBtn, (pressed || sharing) && { opacity: 0.7 }]}>
                  <Text style={styles.quickBtnText}>{sharing ? "…" : "Share"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const top5 = [...chart.rankings].sort((a, b) => a.rank - b.rank).slice(0, 5);
                    const summary = top5.map((r, i) => `${i + 1}. ${r.name}${r.artist_name ? ` – ${r.artist_name}` : ""}`).join("\n");
                    void Share.share({ message: `My Billboard ${weekLabel}\n\n${summary}` });
                  }}
                  style={({ pressed }: { pressed: boolean }) => [styles.quickBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.quickBtnText}>Copy summary</Text>
                </Pressable>
                <Pressable
                  onPress={() => void Share.share({ message: `https://tracklist.app` })}
                  style={({ pressed }: { pressed: boolean }) => [styles.quickBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.quickBtnText}>Copy link</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      )}
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

function PulseTab({
  router,
  billboard,
  pulse,
  isLoading,
}: {
  router: ReturnType<typeof useRouter>;
  billboard: import("@/lib/hooks/useHomeDashboard").BillboardData | null;
  pulse: import("@/lib/hooks/useHomeDashboard").ProfilePulseInsights;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const prefetchArtist = usePrefetchArtist();
  const prefetchAlbum = usePrefetchAlbum();
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
                    onPressIn={() => prefetchArtist(a.artistId)}
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
                    onPressIn={() => prefetchAlbum(al.albumId)}
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
  const { data: bundle, isLoading } = useHomeHistoryBundle();

  if (isLoading && !bundle) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.emerald} />
      </View>
    );
  }

  const blindSpots = bundle?.blindSpots ?? null;
  const report = bundle?.report ?? null;
  const timeline = bundle?.timeline ?? null;
  const insights = bundle?.tasteInsights ?? null;

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
  // Sticky header block — combines logo row + tab row with subtle elevation
  stickyHeader: {
    backgroundColor: "rgba(9,9,11,0.96)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
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
    paddingLeft: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tabBtn: {
    flex: 1,
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
    color: "#71717a",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 2,
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
  // ─── Chart type pills ────────────────────────────────────────────────────────
  chartTypePills: {
    flexDirection: "row",
    gap: 8,
  },
  chartTypePill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chartTypePillActive: {
    backgroundColor: "#059669",
  },
  chartTypePillIdle: {
    backgroundColor: "#27272a",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chartTypePillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  chartTypePillTextActive: {
    color: "#fff",
  },
  chartTypePillTextIdle: {
    color: "#d4d4d8",
  },
  // ─── Week picker ─────────────────────────────────────────────────────────────
  weekPicker: {
    gap: 6,
  },
  weekPickerLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.8,
    color: "#71717a",
    textTransform: "uppercase",
  },
  weekPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#18181b",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.8)",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  weekArrow: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.8)",
    backgroundColor: "#18181b",
  },
  weekArrowText: {
    fontSize: 20,
    color: "#d4d4d8",
    lineHeight: 24,
  },
  weekLabel: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: "center",
  },
  // ─── Hero card — matches web BillboardHero ───────────────────────────────────
  heroCard: {
    backgroundColor: "rgba(24,24,27,0.5)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.8)",
    overflow: "hidden",
    padding: 16,
  },
  heroWeekLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.8,
    color: "#52525b",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroArt: {
    width: 108,
    height: 108,
    borderRadius: 12,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroArtPlaceholder: {
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  heroMeta: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroRank: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(251,191,36,0.9)",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  heroArtist: {
    fontSize: 14,
    color: "#a1a1aa",
  },
  heroPlays: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 2,
  },
  // ─── Billboard narrative card ─────────────────────────────────────────────────
  billboardNarrCard: {
    backgroundColor: "rgba(24,24,27,0.3)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
    padding: 20,
  },
  narrativeSectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.8,
    color: "#71717a",
    textTransform: "uppercase",
  },
  narrativeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  narrativeIcon: {
    fontSize: 16,
    color: "#71717a",
    width: 20,
    textAlign: "center",
    marginTop: 2,
  },
  billboardNarrText: {
    flex: 1,
    fontSize: 16,
    color: "#e4e4e7",
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  // ─── Chart row card — matches web chartRankingRowShell ───────────────────────
  chartCard: {
    backgroundColor: "rgba(24,24,27,0.48)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.85)",
    overflow: "hidden",
  },
  chartCardLeader: {
    borderColor: "rgba(16,185,129,0.25)",
  },
  chartCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  chartCardRank: {
    width: 40,
    textAlign: "center",
    fontSize: 36,
    fontWeight: "700",
    flexShrink: 0,
    lineHeight: 40,
    letterSpacing: -1,
  },
  chartCardRankBright: {
    color: theme.colors.text,
  },
  chartCardRankMuted: {
    color: "#52525b",
  },
  chartCardArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chartCardArtPlaceholder: {
    backgroundColor: "#27272a",
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
    fontWeight: "600",
    color: theme.colors.text,
  },
  chartCardArtist: {
    fontSize: 14,
    color: "#a1a1aa",
  },
  chartCardStats: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 2,
  },
  chartCardStatsDim: {
    color: "#52525b",
  },
  chartCardRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  // ─── Movement indicators (text, not badges) ───────────────────────────────────
  newBadge: {
    backgroundColor: "#1e3a8a",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
    alignSelf: "flex-start",
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#93c5fd",
    letterSpacing: 0.5,
  },
  moveUp: {
    fontSize: 14,
    fontWeight: "700",
    color: "#34d399",
  },
  moveDown: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f87171",
  },
  moveSame: {
    fontSize: 14,
    color: "#52525b",
  },
  // ─── Show more button ────────────────────────────────────────────────────────
  showMoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  showMoreText: {
    fontSize: 14,
    color: theme.colors.muted,
    fontWeight: "500",
  },
  // ─── Mover cards — matches web chartMoverCard ────────────────────────────────
  moverCard: {
    backgroundColor: "rgba(24,24,27,0.5)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.85)",
    padding: 20,
  },
  moverLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: "#71717a",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  moverName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  moverSubtitle: {
    fontSize: 14,
    color: "#71717a",
    marginTop: 4,
  },
  // Share card
  // Share section — matches web's dark bg-zinc-950/65 card
  shareCard: {
    backgroundColor: "rgba(9,9,11,0.65)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.8)",
    padding: 24,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  shareDesc: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20,
    marginBottom: 24,
  },
  shareBtn: {
    backgroundColor: "#10b981",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  quickActionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: "#71717a",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: "#27272a",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    alignItems: "center",
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#d4d4d8",
    textAlign: "center",
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
