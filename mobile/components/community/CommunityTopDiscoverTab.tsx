import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import type {
  CommunityConsensusItem,
  CommunityInsightsPayload,
  CommunityLeaderboardRow,
} from "../../lib/api-communities";
import { theme } from "../../lib/theme";
import { CollapsibleSection } from "./CollapsibleSection";
import { CommunityInsights } from "./CommunityInsights";
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
  leaderboard: CommunityLeaderboardRow[];
  lbPending: boolean;
};

const LB_PREVIEW = 5;

export function CommunityTopDiscoverTab({
  communityId,
  canInvite,
  tasteMatch,
  insights,
  insightsPending,
  albumItems,
  artistItems,
  consensusPending,
  leaderboard,
  lbPending,
}: Props) {
  const router = useRouter();
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const preview = leaderboard.slice(0, LB_PREVIEW);

  return (
    <View style={styles.root}>
      {tasteMatch ? (
        <CommunityTasteMatchCard
          score={tasteMatch.score}
          label={tasteMatch.label}
          shortLabel={tasteMatch.shortLabel}
        />
      ) : null}

      {canInvite ? <InviteMembersPanel communityId={communityId} /> : null}

      <CollapsibleSection
        title="Top albums"
        subtitle="Shared favorites this week · swipe sideways"
        defaultOpen
      >
        {consensusPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : (
          <HorizontalEntityCarousel
            entity="album"
            items={albumItems}
            emptyLabel="No album consensus yet — log music in this group."
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Top artists"
        subtitle="Who the community is rallying around"
        defaultOpen
      >
        {consensusPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : (
          <HorizontalEntityCarousel
            entity="artist"
            items={artistItems}
            emptyLabel="No artist consensus yet."
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="This week’s leaderboard"
        subtitle="Last 7 days · by listens"
        defaultOpen
      >
        {lbPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : leaderboard.length === 0 ? (
          <Text style={styles.muted}>No listens logged this week yet.</Text>
        ) : (
          <>
            {(leaderboardExpanded ? leaderboard : preview).map((row, i) => (
              <LeaderboardRow
                key={row.userId}
                rank={i + 1}
                row={row}
                router={router}
              />
            ))}
            {leaderboard.length > LB_PREVIEW ? (
              <Pressable
                onPress={() => setLeaderboardExpanded((e) => !e)}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>
                  {leaderboardExpanded ? "Show less" : "View all"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Group insights"
        subtitle="Exploration, diversity, and listening patterns"
        defaultOpen={false}
      >
        {insightsPending ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : insights ? (
          <CommunityInsights insights={insights} hideTopArtists embedded />
        ) : (
          <Text style={styles.muted}>Insights unavailable.</Text>
        )}
      </CollapsibleSection>
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
        <Image source={{ uri: row.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPh}>
          <Text style={styles.avatarPhText}>
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
  muted: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rank: { width: 22, fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhText: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
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
