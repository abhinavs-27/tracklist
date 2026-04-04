import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CommunityInsightsPayload } from "@/lib/api-communities";
import { theme } from "@/lib/theme";

type Props = {
  insights: CommunityInsightsPayload;
  /** Hide the horizontal “Top artists” strip (e.g. when shown in a discovery carousel elsewhere). */
  hideTopArtists?: boolean;
  /** When true, omit “Group insights” title block (use inside a collapsible). */
  embedded?: boolean;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function CommunityInsights({
  insights,
  hideTopArtists = false,
  embedded = false,
}: Props) {
  const router = useRouter();
  const {
    summary,
    topArtists,
    explorationScore,
    explorationLabel,
    timeOfDay,
    dominantTime,
    diversityScore,
    diversityLabel,
  } = insights;

  const totalTime =
    timeOfDay.morning +
    timeOfDay.afternoon +
    timeOfDay.night +
    timeOfDay.lateNight;

  return (
    <View style={styles.wrap}>
      {embedded ? null : (
        <View style={styles.header}>
          <Text style={styles.h2}>Group insights</Text>
          <Text style={styles.sub}>
            Based on everyone&apos;s listens from the last seven days, by time of day.
          </Text>
        </View>
      )}

      <Text style={styles.summary}>{summary}</Text>

      {hideTopArtists ? null : (
        <>
          <Text style={styles.sectionLabel}>Top artists</Text>
          {topArtists.length === 0 ? (
            <Text style={styles.muted}>No artist data for this period yet.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.artistRow}
            >
              {topArtists.map((a) => (
                <Pressable
                  key={a.artistId}
                  style={styles.artistCard}
                  onPress={() =>
                    router.push(`/artist/${encodeURIComponent(a.artistId)}`)
                  }
                >
                  <Text style={styles.artistName} numberOfLines={2}>
                    {a.name}
                  </Text>
                  <Text style={styles.artistCount}>{a.count} listens</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      )}

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Exploration</Text>
          <Text style={styles.metricValEmerald}>{pct(explorationScore)}</Text>
          <Text style={styles.metricSub}>{explorationLabel}</Text>
          <Text style={styles.metricHint}>Unique artists ÷ total listens</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Taste overlap</Text>
          <Text style={styles.metricValAmber}>{pct(diversityScore)}</Text>
          <Text style={styles.metricSub}>{diversityLabel}</Text>
          <Text style={styles.metricHint}>
            Avg. similarity of each member&apos;s top artists
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Time pattern</Text>
      <Text style={styles.dominantLine}>
        Strongest: <Text style={styles.dominantEm}>{dominantTime}</Text>
      </Text>
      {totalTime === 0 ? (
        <Text style={styles.muted}>No timestamps in range.</Text>
      ) : (
        <>
          <View style={styles.barTrack}>
            {timeOfDay.morning > 0 ? (
              <View style={[styles.barSeg, { flex: timeOfDay.morning, backgroundColor: "#0ea5e9" }]} />
            ) : null}
            {timeOfDay.afternoon > 0 ? (
              <View style={[styles.barSeg, { flex: timeOfDay.afternoon, backgroundColor: "#f59e0b" }]} />
            ) : null}
            {timeOfDay.night > 0 ? (
              <View style={[styles.barSeg, { flex: timeOfDay.night, backgroundColor: "#8b5cf6" }]} />
            ) : null}
            {timeOfDay.lateNight > 0 ? (
              <View style={[styles.barSeg, { flex: timeOfDay.lateNight, backgroundColor: "#4f46e5" }]} />
            ) : null}
          </View>
          <View style={styles.legend}>
            <Text style={styles.legendItem}>
              <Text style={styles.dotSky}>■</Text> Morning 6–12 ({timeOfDay.morning})
            </Text>
            <Text style={styles.legendItem}>
              <Text style={styles.dotAmber}>■</Text> Afternoon 12–18 ({timeOfDay.afternoon})
            </Text>
            <Text style={styles.legendItem}>
              <Text style={styles.dotViolet}>■</Text> Evening 18–24 ({timeOfDay.night})
            </Text>
            <Text style={styles.legendItem}>
              <Text style={styles.dotIndigo}>■</Text> Late night 0–6 ({timeOfDay.lateNight})
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    backgroundColor: "rgba(24,24,27,0.35)",
  },
  header: { marginBottom: 12 },
  h2: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  sub: {
    marginTop: 4,
    fontSize: 11,
    color: theme.colors.muted,
    lineHeight: 15,
  },
  summary: {
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.muted,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  muted: { fontSize: 14, color: theme.colors.muted },
  artistRow: { gap: 10, paddingBottom: 4 },
  artistCard: {
    width: 140,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  artistName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  artistCount: { marginTop: 4, fontSize: 12, color: theme.colors.muted },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  metric: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "rgba(9,9,11,0.5)",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.colors.muted,
    textTransform: "uppercase",
  },
  metricValEmerald: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  metricValAmber: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "800",
    color: "#fbbf24",
  },
  metricSub: { marginTop: 4, fontSize: 14, color: theme.colors.muted },
  metricHint: { marginTop: 6, fontSize: 10, color: "#71717a" },
  dominantLine: { fontSize: 14, color: theme.colors.muted, marginBottom: 10 },
  dominantEm: { color: theme.colors.text, fontWeight: "600" },
  barTrack: {
    flexDirection: "row",
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
  },
  barSeg: { minWidth: 2 },
  legend: { marginTop: 10, gap: 6 },
  legendItem: { fontSize: 11, color: theme.colors.muted },
  dotSky: { color: "#0ea5e9" },
  dotAmber: { color: "#f59e0b" },
  dotViolet: { color: "#8b5cf6" },
  dotIndigo: { color: "#4f46e5" },
});
