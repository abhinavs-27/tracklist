import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  CommunityConsensusItem,
  CommunityInsightsPayload,
  CommunityLeaderboardRow,
  CommunityWeeklySummaryApiResponse,
} from "../../lib/api-communities";
import { theme } from "../../lib/theme";
import { CollapsibleSection } from "./CollapsibleSection";
import { CommunityTasteMatchCard } from "./CommunityTasteMatchCard";
import { HorizontalEntityCarousel } from "./HorizontalEntityCarousel";
import { InviteMembersPanel } from "./InviteMembersPanel";

type Props = {
  communityId: string;
  canInvite: boolean;
  tasteMatch: { score: number; label: string; shortLabel: string } | null | undefined;
  insights: CommunityInsightsPayload | null | undefined;
  insightsPending: boolean;
  albumItems: CommunityConsensusItem[];
  artistItems: CommunityConsensusItem[];
  consensusPending: boolean;
  weekly: CommunityWeeklySummaryApiResponse | null | undefined;
  weeklyPending: boolean;
  leaderboard: CommunityLeaderboardRow[];
  lbPending: boolean;
};

const LB_PREVIEW = 5;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function timeBarPct(
  insights: CommunityInsightsPayload,
  key: keyof CommunityInsightsPayload["timeOfDay"],
): number {
  const t =
    insights.timeOfDay.morning +
    insights.timeOfDay.afternoon +
    insights.timeOfDay.night +
    insights.timeOfDay.lateNight;
  if (t === 0) return 0;
  return Math.round((insights.timeOfDay[key] / t) * 100);
}

export function CommunityVibeTab({
  communityId,
  canInvite,
  tasteMatch,
  insights,
  insightsPending,
  albumItems,
  artistItems,
  consensusPending,
  weekly,
  weeklyPending,
  leaderboard,
  lbPending,
}: Props) {
  const router = useRouter();
  const [lbExpanded, setLbExpanded] = useState(false);
  const preview = leaderboard.slice(0, LB_PREVIEW);

  const genres = weekly?.current?.top_genres ?? [];
  const stylesWeekly = weekly?.current?.top_styles ?? [];
  const maxG = Math.max(1, ...genres.map((g) => g.weight));

  return (
    <View style={styles.root}>
      <Text style={styles.heroLabel}>Community vibe</Text>
      <Text style={styles.heroSub}>
        What this group sounds like lately — genres, momentum, and shared favorites.
      </Text>

      {tasteMatch ? (
        <CommunityTasteMatchCard
          score={tasteMatch.score}
          label={tasteMatch.label}
          shortLabel={tasteMatch.shortLabel}
        />
      ) : null}

      {canInvite ? <InviteMembersPanel communityId={communityId} /> : null}

      {insights && !insightsPending && insights.summary ? (
        <View style={styles.blurb}>
          <Text style={styles.blurbText}>{insights.summary}</Text>
        </View>
      ) : null}

      {insights && !insightsPending ? (
        <View style={styles.pulseRow}>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseVal}>{pct(insights.explorationScore)}</Text>
            <Text style={styles.pulseLabel}>Exploration</Text>
            <Text style={styles.pulseHint} numberOfLines={2}>
              {insights.explorationLabel}
            </Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseVal}>{pct(insights.diversityScore)}</Text>
            <Text style={styles.pulseLabel}>Taste overlap</Text>
            <Text style={styles.pulseHint} numberOfLines={2}>
              {insights.diversityLabel}
            </Text>
          </View>
        </View>
      ) : insightsPending ? (
        <View style={styles.skelRow}>
          <ActivityIndicator color={theme.colors.emerald} />
        </View>
      ) : null}

      {insights && !insightsPending ? (
        <View style={styles.clockSection}>
          <Text style={styles.sectionTitle}>Listening clock</Text>
          <Text style={styles.sectionSub}>
            Strongest: {insights.dominantTime}
          </Text>
          <View style={styles.clockBar}>
            <View
              style={[
                styles.clockSeg,
                { flex: Math.max(1, timeBarPct(insights, "morning")), backgroundColor: "#38bdf8" },
              ]}
            />
            <View
              style={[
                styles.clockSeg,
                {
                  flex: Math.max(1, timeBarPct(insights, "afternoon")),
                  backgroundColor: "#fbbf24",
                },
              ]}
            />
            <View
              style={[
                styles.clockSeg,
                {
                  flex: Math.max(1, timeBarPct(insights, "night")),
                  backgroundColor: "#a78bfa",
                },
              ]}
            />
            <View
              style={[
                styles.clockSeg,
                {
                  flex: Math.max(1, timeBarPct(insights, "lateNight")),
                  backgroundColor: "#6366f1",
                },
              ]}
            />
          </View>
          <Text style={styles.clockLegend}>
            Morning → afternoon → evening → late night
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.sectionTitle}>Top genres this week</Text>
        <Text style={styles.sectionSub}>Weighted by group listening</Text>
        {weeklyPending ? (
          <ActivityIndicator color={theme.colors.emerald} style={{ marginTop: 12 }} />
        ) : genres.length === 0 ? (
          <Text style={styles.muted}>No genre snapshot yet.</Text>
        ) : (
          <View style={styles.genreList}>
            {genres.slice(0, 8).map((g) => (
              <View key={g.name} style={styles.genreRow}>
                <Text style={styles.genreName} numberOfLines={1}>
                  {g.name}
                </Text>
                <View style={styles.genreTrack}>
                  <View
                    style={[
                      styles.genreFill,
                      { width: `${Math.max(8, (g.weight / maxG) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {stylesWeekly.length > 0 ? (
        <View style={styles.stylesBlock}>
          <Text style={styles.sectionTitle}>Listening styles</Text>
          <Text style={styles.sectionSub}>Share of group taste this week</Text>
          <View style={styles.styleChipWrap}>
            {stylesWeekly.slice(0, 10).map((s) => (
              <View key={s.style} style={styles.styleChip}>
                <Text style={styles.styleChipText} numberOfLines={1}>
                  {s.style} · {Math.round(s.share * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <CollapsibleSection
        title="Trending artists"
        subtitle="Who the group is rallying around"
        defaultOpen
      >
        {consensusPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : (
          <HorizontalEntityCarousel
            entity="artist"
            items={artistItems}
            emptyLabel="No artist momentum yet."
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Albums in rotation"
        subtitle="Shared favorites · swipe sideways"
        defaultOpen
      >
        {consensusPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : (
          <HorizontalEntityCarousel
            entity="album"
            items={albumItems}
            emptyLabel="No album consensus yet — log music together."
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="This week’s spin leaders"
        subtitle="Last 7 days · by listens"
        defaultOpen
      >
        {lbPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : leaderboard.length === 0 ? (
          <Text style={styles.muted}>No listens logged this week yet.</Text>
        ) : (
          <>
            {(lbExpanded ? leaderboard : preview).map((row, i) => (
              <LeaderboardRow
                key={row.userId}
                rank={i + 1}
                row={row}
                router={router}
              />
            ))}
            {leaderboard.length > LB_PREVIEW ? (
              <Pressable
                onPress={() => setLbExpanded((e) => !e)}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>
                  {lbExpanded ? "Show less" : "View all"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </CollapsibleSection>

      {weekly?.trend &&
      (weekly.trend.genres.gained.length > 0 ||
        weekly.trend.genres.lost.length > 0) ? (
        <View style={styles.momentum}>
          <Text style={styles.sectionTitle}>This week&apos;s genre leaders</Text>
          <Text style={styles.sectionSub}>
            Momentum vs last week — genres surging or cooling in the group
          </Text>
          {weekly.trend.genres.gained.length > 0 ? (
            <View style={styles.chipWrap}>
              {weekly.trend.genres.gained.slice(0, 10).map((g) => (
                <View key={g} style={styles.chip}>
                  <Text style={styles.chipText}>↑ {g}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {weekly.trend.genres.lost.length > 0 ? (
            <View style={[styles.chipWrap, { marginTop: 12 }]}>
              {weekly.trend.genres.lost.slice(0, 10).map((g) => (
                <View key={g} style={styles.chipCool}>
                  <Text style={styles.chipCoolText}>↓ {g}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LeaderboardRow({
  rank,
  row,
  router,
}: {
  rank: number;
  row: CommunityLeaderboardRow;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Pressable
      style={styles.lbRow}
      onPress={() =>
        router.push(`/user/${encodeURIComponent(row.username)}` as Href)
      }
    >
      <Text style={styles.rank}>{rank}</Text>
      {row.avatar_url ? (
        <Image source={{ uri: row.avatar_url }} style={styles.lbAvatar} />
      ) : (
        <View style={styles.lbAvatarPh}>
          <Text style={styles.lbAvatarPhText}>
            {row.username[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lbName}>{row.username}</Text>
        <Text style={styles.lbSub}>
          {row.totalLogs} listens · {row.uniqueArtists} artists
          {row.streakDays > 0 ? (
            <Text style={styles.streak}> · {row.streakDays}d streak</Text>
          ) : null}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 4 },
  heroLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: theme.colors.emerald,
    textTransform: "uppercase",
  },
  heroSub: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 14,
  },
  blurb: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.2)",
  },
  blurbText: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text,
    fontWeight: "500",
  },
  pulseRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  pulseCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pulseVal: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  pulseLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  pulseHint: { fontSize: 11, color: theme.colors.muted, marginTop: 4, lineHeight: 15 },
  skelRow: { paddingVertical: 16, alignItems: "center", marginBottom: 8 },
  clockSection: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(24,24,27,0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionSub: { fontSize: 12, color: theme.colors.muted, marginTop: 4, marginBottom: 10 },
  clockBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: theme.colors.border,
  },
  clockSeg: { minWidth: 2 },
  clockLegend: { fontSize: 11, color: theme.colors.muted, marginTop: 8, lineHeight: 15 },
  block: { marginBottom: 18 },
  genreList: { gap: 10, marginTop: 4 },
  genreRow: { gap: 6 },
  genreName: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  genreTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
  },
  genreFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: theme.colors.emerald,
  },
  momentum: { marginBottom: 16 },
  stylesBlock: { marginBottom: 18 },
  styleChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  styleChip: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  styleChipText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.35)",
  },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.colors.emerald },
  chipCool: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(244,63,94,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(244,63,94,0.35)",
  },
  chipCoolText: { fontSize: 13, fontWeight: "700", color: "#fda4af" },
  muted: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rank: { width: 22, fontSize: 14, fontWeight: "700", color: theme.colors.muted },
  lbAvatar: { width: 40, height: 40, borderRadius: 20 },
  lbAvatarPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  lbAvatarPhText: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  lbName: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  lbSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  streak: { color: "#fbbf24", fontWeight: "600" },
  viewAllBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
});
