import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

export type BillboardRow = {
  entity_id: string;
  name: string;
  artist_name: string | null;
  image: string | null;
  rank: number;
  play_count: number;
  movement?: number | null;
  rank_movement?: string;
  rank_delta?: number | null;
  is_new?: boolean;
  is_reentry?: boolean;
  is_number_one?: boolean;
  unique_listeners?: number | null;
  weeks_at_1?: number;
  weeks_in_top_10?: number;
};

export type BillboardMover = {
  entity_id: string;
  name: string;
  prev_rank?: number | null;
  movement?: number | null;
  is_new?: boolean;
};

export type BillboardMovers = {
  biggestMover?: BillboardMover | null;
  highestNew?: BillboardMover | null;
  dropout?: BillboardMover | null;
};

type Props = {
  weekLabel: string;
  rankings: BillboardRow[];
  narrative: string[];
  narrativeLabel?: string;
  movers?: BillboardMovers | null;
  communityActiveUsers?: number | null;
  viewerContributed?: boolean;
  nextChartDropIso?: string | null;
  onNavigate: (entityId: string) => void;
};

const NARRATIVE_ICONS = ["✦", "↗", "↑", "·"];

function formatCountdown(isoTime: string): string {
  const ms = new Date(isoTime).getTime() - Date.now();
  if (ms <= 0) return "Chart ready soon";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `Next chart drops in ${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `Next chart drops in ${hours}h ${mins}m`;
}

function MovementIndicator({ row }: { row: BillboardRow }) {
  const isNew = row.is_new || row.rank_movement === "NEW";
  const isReentry = row.is_reentry;
  if (isNew || isReentry) {
    return (
      <View style={s.newBadge}>
        <Text style={s.newBadgeText}>{isReentry ? "RE" : "NEW"}</Text>
      </View>
    );
  }
  const delta = row.rank_delta ?? (row.movement != null ? Math.abs(row.movement) : null);
  const isUp = row.rank_movement === "UP" || (row.movement != null && row.movement > 0);
  const isDown = row.rank_movement === "DOWN" || (row.movement != null && row.movement < 0);
  if (isUp && delta && delta > 0) return <Text style={s.moveUp}>▲{delta}</Text>;
  if (isDown && delta && delta > 0) return <Text style={s.moveDown}>▼{delta}</Text>;
  return <Text style={s.moveSame}>—</Text>;
}

function ChartRowCard({ row, onPress }: { row: BillboardRow; onPress: () => void }) {
  const statsStr = row.unique_listeners != null
    ? `${row.play_count.toLocaleString()} plays · ${row.unique_listeners} listeners`
    : row.weeks_in_top_10 != null
      ? `${row.play_count.toLocaleString()} plays · ${row.weeks_in_top_10}w in top 10`
      : `${row.play_count.toLocaleString()} plays`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [s.chartCard, pressed && { opacity: 0.82 }]}
    >
      <View style={s.chartCardInner}>
        <Text style={[s.chartRank, row.rank <= 3 ? s.chartRankBright : s.chartRankMuted]}>
          {row.rank}
        </Text>
        {row.image
          ? <Image source={{ uri: row.image }} style={s.chartArt} contentFit="cover" />
          : <View style={[s.chartArt, s.chartArtPlaceholder]}><Text style={{ fontSize: 18, color: theme.colors.muted }}>—</Text></View>}
        <View style={s.chartMeta}>
          <Text style={s.chartTitle} numberOfLines={1}>{row.name}</Text>
          {row.artist_name ? <Text style={s.chartArtist} numberOfLines={1}>{row.artist_name}</Text> : null}
          <Text style={s.chartStats}>{statsStr}</Text>
        </View>
        <View style={s.chartRight}>
          <MovementIndicator row={row} />
        </View>
      </View>
    </Pressable>
  );
}

function MoverCard({ label, mover, onPress }: { label: string; mover: BillboardMover; onPress?: () => void }) {
  const movAbs = mover.movement != null ? Math.abs(mover.movement) : null;
  const isUp = mover.movement != null && mover.movement > 0;
  const isDown = mover.movement != null && mover.movement < 0;
  const movStr = movAbs != null && movAbs > 0 ? (isDown ? `▼${movAbs}` : `▲${movAbs}`) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [s.moverCard, pressed && { opacity: 0.82 }]}
    >
      <Text style={s.moverLabel}>{label}</Text>
      <Text style={s.moverName} numberOfLines={2}>{mover.name}</Text>
      {mover.prev_rank != null && !mover.is_new && isDown ? (
        <Text style={s.moverSub}>Was #{mover.prev_rank} · left the chart</Text>
      ) : mover.is_new ? (
        <Text style={s.moverSub}>New</Text>
      ) : null}
      {movStr ? (
        <Text style={[s.moverMove, isUp ? s.moverMoveUp : s.moverMoveDown]}>{movStr}</Text>
      ) : null}
    </Pressable>
  );
}

export function BillboardChartContent({
  weekLabel,
  rankings,
  narrative,
  narrativeLabel = "THIS WEEK",
  movers,
  communityActiveUsers,
  viewerContributed,
  nextChartDropIso,
  onNavigate,
}: Props) {
  const [showMore, setShowMore] = useState(false);

  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
  const hero = sorted[0] ?? null;
  const spots2to5 = sorted.filter((r) => r.rank >= 2 && r.rank <= 5);
  const spots6plus = sorted.filter((r) => r.rank > 5);

  return (
    <View style={s.wrap}>
      {/* Community badges */}
      {(communityActiveUsers != null || viewerContributed) ? (
        <View style={s.badgeRow}>
          {communityActiveUsers != null && (
            <View style={s.badge}><Text style={s.badgeText}>{communityActiveUsers} listeners this week</Text></View>
          )}
          {viewerContributed && (
            <View style={s.badgeContrib}><Text style={s.badgeContribText}>You contributed</Text></View>
          )}
        </View>
      ) : null}

      {/* Countdown */}
      {nextChartDropIso ? (
        <View style={s.countdown}>
          <Text style={s.countdownText}>{formatCountdown(nextChartDropIso)}</Text>
        </View>
      ) : null}

      {/* #1 Hero — side-by-side layout matching home billboard */}
      {hero ? (
        <Pressable
          onPress={() => onNavigate(hero.entity_id)}
          style={({ pressed }: { pressed: boolean }) => [s.heroCard, pressed && { opacity: 0.82 }]}
        >
          <Text style={s.heroWeekLabel}>{weekLabel}</Text>
          <View style={s.heroInner}>
            {hero.image
              ? <Image source={{ uri: hero.image }} style={s.heroArt} contentFit="cover" />
              : <View style={[s.heroArt, s.heroArtPlaceholder]}><Text style={{ fontSize: 32, color: theme.colors.muted }}>♪</Text></View>}
            <View style={s.heroMeta}>
              <Text style={s.heroRank}>#1 THIS WEEK</Text>
              <Text style={s.heroTitle} numberOfLines={2}>{hero.name}</Text>
              {hero.artist_name ? <Text style={s.heroArtist} numberOfLines={1}>{hero.artist_name}</Text> : null}
              <Text style={s.heroPlays}>
                {hero.play_count.toLocaleString()} plays
                {hero.unique_listeners != null ? ` · ${hero.unique_listeners} listeners` : ""}
                {hero.weeks_at_1 != null ? ` · ${hero.weeks_at_1}w at #1` : ""}
              </Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* Narrative */}
      {narrative.length > 0 ? (
        <View style={s.narrativeCard}>
          <Text style={s.narrativeLabel}>{narrativeLabel}</Text>
          <View style={{ gap: 16, marginTop: 16 }}>
            {narrative.map((line, i) => (
              <View key={i} style={s.narrativeRow}>
                <Text style={s.narrativeIcon}>{NARRATIVE_ICONS[i % NARRATIVE_ICONS.length]}</Text>
                <Text style={s.narrativeText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Spots 2–5 */}
      {spots2to5.length > 0 ? (
        <View>
          <Text style={s.sectionLabel}>SPOTS 2–5</Text>
          <View style={{ gap: 10 }}>
            {spots2to5.map((row) => (
              <ChartRowCard key={row.entity_id} row={row} onPress={() => onNavigate(row.entity_id)} />
            ))}
          </View>
        </View>
      ) : null}

      {/* Spots 6+ */}
      {spots6plus.length > 0 ? (
        !showMore ? (
          <Pressable onPress={() => setShowMore(true)} style={s.showMoreBtn}>
            <Text style={s.showMoreText}>Show spots 6–{Math.min(spots6plus.length + 5, 10)} ▾</Text>
          </Pressable>
        ) : (
          <View>
            <Text style={s.sectionLabel}>SPOTS 6–{spots6plus.length + 5}</Text>
            <View style={{ gap: 10 }}>
              {spots6plus.map((row) => (
                <ChartRowCard key={row.entity_id} row={row} onPress={() => onNavigate(row.entity_id)} />
              ))}
            </View>
          </View>
        )
      ) : null}

      {/* Biggest movers — after the full chart */}
      {movers && (movers.biggestMover || movers.highestNew || movers.dropout) ? (
        <View style={s.moversSection}>
          <Text style={s.sectionLabel}>Biggest movers</Text>
          <View style={s.moversList}>
            {movers.biggestMover ? <MoverCard label="Biggest jump" mover={movers.biggestMover} onPress={() => onNavigate(movers.biggestMover!.entity_id)} /> : null}
            {movers.dropout ? <MoverCard label="Biggest drop" mover={movers.dropout} onPress={() => onNavigate(movers.dropout!.entity_id)} /> : null}
            {movers.highestNew ? <MoverCard label="Best new entry" mover={movers.highestNew} onPress={() => onNavigate(movers.highestNew!.entity_id)} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(63,63,70,0.6)", backgroundColor: "rgba(39,39,42,0.6)", paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 13, color: "#d4d4d8" },
  badgeContrib: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)", backgroundColor: "rgba(6,46,37,0.5)", paddingHorizontal: 12, paddingVertical: 6 },
  badgeContribText: { fontSize: 13, fontWeight: "500", color: "#34d399" },

  countdown: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(217,119,6,0.3)", backgroundColor: "rgba(120,53,15,0.3)", paddingHorizontal: 14, paddingVertical: 10 },
  countdownText: { fontSize: 14, fontWeight: "500", color: "#fbbf24" },

  heroCard: { backgroundColor: "rgba(24,24,27,0.48)", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(63,63,70,0.85)", padding: 20 },
  heroWeekLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1.8, color: "#71717a", textTransform: "uppercase", marginBottom: 16 },
  heroInner: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroArt: { width: 108, height: 108, borderRadius: 14, flexShrink: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  heroArtPlaceholder: { backgroundColor: "#27272a", alignItems: "center", justifyContent: "center" },
  heroMeta: { flex: 1, minWidth: 0 },
  heroRank: { fontSize: 10, fontWeight: "800", color: "rgba(251,191,36,0.9)", letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 6 },
  heroTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, lineHeight: 24, letterSpacing: -0.3 },
  heroArtist: { fontSize: 14, color: "#a1a1aa", marginTop: 2 },
  heroPlays: { fontSize: 12, color: "#71717a", marginTop: 6 },

  narrativeCard: { backgroundColor: "rgba(24,24,27,0.3)", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.05)", padding: 20 },
  narrativeLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1.8, color: "#71717a", textTransform: "uppercase" },
  narrativeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  narrativeIcon: { fontSize: 14, color: "#10b981", marginTop: 1, width: 16 },
  narrativeText: { flex: 1, fontSize: 14, color: "#d4d4d8", lineHeight: 22 },

  moversSection: { gap: 16 },
  moversList: { gap: 12 },
  moverCard: { backgroundColor: "rgba(24,24,27,0.48)", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(63,63,70,0.85)", padding: 16 },
  moverLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.8, color: theme.colors.muted, textTransform: "uppercase", marginBottom: 8 },
  moverName: { fontSize: 18, fontWeight: "700", color: theme.colors.text, lineHeight: 24 },
  moverSub: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
  moverMove: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  moverMoveUp: { color: "#34d399" },
  moverMoveDown: { color: "#f87171" },

  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: theme.colors.muted, textTransform: "uppercase", marginBottom: 12 },

  chartCard: { backgroundColor: "rgba(24,24,27,0.48)", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(63,63,70,0.85)", overflow: "hidden" },
  chartCardInner: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  chartRank: { width: 40, textAlign: "center", fontSize: 36, fontWeight: "700", flexShrink: 0, lineHeight: 40, letterSpacing: -1 },
  chartRankBright: { color: theme.colors.text },
  chartRankMuted: { color: "#52525b" },
  chartArt: { width: 56, height: 56, borderRadius: 8, flexShrink: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  chartArtPlaceholder: { backgroundColor: "#27272a", alignItems: "center", justifyContent: "center" },
  chartMeta: { flex: 1, gap: 3, minWidth: 0 },
  chartTitle: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  chartArtist: { fontSize: 14, color: "#a1a1aa" },
  chartStats: { fontSize: 12, color: "#71717a", marginTop: 2 },
  chartRight: { alignItems: "flex-end", flexShrink: 0 },

  newBadge: { backgroundColor: "#1e3a8a", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(96,165,250,0.3)" },
  newBadgeText: { fontSize: 10, fontWeight: "700", color: "#93c5fd", letterSpacing: 0.5 },
  moveUp: { fontSize: 13, fontWeight: "700", color: "#34d399" },
  moveDown: { fontSize: 13, fontWeight: "700", color: "#f87171" },
  moveSame: { fontSize: 13, color: "#52525b" },

  showMoreBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: theme.colors.panelSoft },
  showMoreText: { fontSize: 13, fontWeight: "600", color: theme.colors.emerald },
});
