import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { CommunityActivityFeed } from "../../components/community/CommunityActivityFeed";
import { CommunityPeopleTab } from "../../components/community/CommunityPeopleTab";
import { CommunityVibeTab } from "../../components/community/CommunityVibeTab";
import {
  acceptCommunityInviteApi,
  declineCommunityInviteApi,
  fetchCommunityConsensus,
  fetchCommunityDetail,
  fetchCommunityFeed,
  fetchCommunityInsights,
  fetchCommunityLeaderboard,
  fetchCommunityWeeklySummary,
  joinCommunity,
  type CommunityFeedItemV2,
} from "../../lib/api-communities";
import { useAuth } from "../../lib/hooks/useAuth";
import { fetchCommunityTasteMatch } from "../../lib/api-taste";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

export default function CommunityDetailScreen() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    if (!rawId) return "";
    return Array.isArray(rawId) ? rawId[0] : rawId;
  }, [rawId]);

  const [joining, setJoining] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [memberTab, setMemberTab] = useState<"vibe" | "people" | "activity">(
    "vibe",
  );
  const [tz, setTz] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const { data: meta, isPending: metaPending } = useQuery({
    queryKey: queryKeys.community(id),
    queryFn: () => fetchCommunityDetail(id),
    enabled: !!id,
  });

  const isMember = meta?.is_member ?? false;

  const { data: insights, isPending: insightsPending } = useQuery({
    queryKey: queryKeys.communityInsights(id),
    queryFn: () => fetchCommunityInsights(id).then((r) => r.insights),
    enabled: !!id && isMember,
  });

  const { data: lbData, isPending: lbPending } = useQuery({
    queryKey: queryKeys.communityLeaderboard(id),
    queryFn: () => fetchCommunityLeaderboard(id),
    enabled: !!id && isMember,
  });

  const { data: feedData, isPending: feedPending } = useQuery({
    queryKey: queryKeys.communityFeed(id),
    queryFn: () => fetchCommunityFeed(id, 20),
    enabled: !!id && isMember,
  });

  const { data: tasteMatch } = useQuery({
    queryKey: queryKeys.communityTasteMatch(id),
    queryFn: () => fetchCommunityTasteMatch(id),
    enabled: !!id && isMember && !!authUser?.id,
  });

  const { data: albumConsensus, isPending: albumConsensusPending } = useQuery({
    queryKey: queryKeys.communityConsensus(id, "album", "month"),
    queryFn: () => fetchCommunityConsensus(id, { type: "album", limit: 20 }),
    enabled: !!id && isMember,
  });

  const { data: artistConsensus, isPending: artistConsensusPending } = useQuery({
    queryKey: queryKeys.communityConsensus(id, "artist", "month"),
    queryFn: () => fetchCommunityConsensus(id, { type: "artist", limit: 20 }),
    enabled: !!id && isMember,
  });

  const { data: weeklyData, isPending: weeklyPending } = useQuery({
    queryKey: queryKeys.communityWeeklySummary(id, tz ?? "UTC"),
    queryFn: () => fetchCommunityWeeklySummary(id, tz ?? "UTC"),
    enabled: !!id && isMember && !!tz,
  });

  const [feedExtra, setFeedExtra] = useState<CommunityFeedItemV2[]>([]);
  const [feedNextOffset, setFeedNextOffset] = useState<number | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  useEffect(() => {
    setFeedExtra([]);
    setFeedNextOffset(feedData?.next_offset ?? null);
  }, [id, feedData]);

  const community = meta?.community;
  const pendingInviteId = meta?.pending_invite_id ?? null;
  const canInvite = useMemo(() => {
    if (!isMember || !community || !meta?.my_role) return false;
    if (community.is_private) return true;
    return meta.my_role === "admin";
  }, [isMember, community, meta?.my_role]);
  const leaderboard = lbData?.leaderboard ?? [];
  const feedBase = feedData?.feed ?? [];
  const feed = [...feedBase, ...feedExtra];

  async function onAcceptInvite() {
    if (!pendingInviteId) return;
    setJoinErr(null);
    setInviteBusy(true);
    try {
      await acceptCommunityInviteApi(pendingInviteId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityLeaderboard(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityFeed(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityInsights(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityTasteMatch(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communitiesMine(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityInvites(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityConsensus(id, "album", "month"),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityConsensus(id, "artist", "month"),
      });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "communityWeeklySummary" &&
          q.queryKey[1] === id,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityMembersInfinite(id),
      });
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not accept");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onDeclineInvite() {
    if (!pendingInviteId) return;
    setJoinErr(null);
    setInviteBusy(true);
    try {
      await declineCommunityInviteApi(pendingInviteId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityInvites(),
      });
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not decline");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onLoadMoreFeed() {
    if (!id || feedNextOffset == null || feedLoadingMore) return;
    setFeedLoadingMore(true);
    try {
      const res = await fetchCommunityFeed(id, 20, { offset: feedNextOffset });
      setFeedExtra((prev: CommunityFeedItemV2[]) => [...prev, ...res.feed]);
      setFeedNextOffset(res.next_offset ?? null);
    } finally {
      setFeedLoadingMore(false);
    }
  }

  async function onJoin() {
    if (!id) return;
    setJoinErr(null);
    setJoining(true);
    try {
      await joinCommunity(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(id) });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityLeaderboard(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityFeed(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityInsights(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityTasteMatch(id),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communitiesMine(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityConsensus(id, "album", "month"),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityConsensus(id, "artist", "month"),
      });
      await queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "communityWeeklySummary" &&
          q.queryKey[1] === id,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communityMembersInfinite(id),
      });
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }

  if (!id) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.err}>Invalid community.</Text>
      </SafeAreaView>
    );
  }

  const consensusPending = albumConsensusPending || artistConsensusPending;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Communities</Text>
        </Pressable>

        {metaPending && !community ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.emerald} />
          </View>
        ) : !community ? (
          <Text style={styles.err}>Community not found.</Text>
        ) : (
          <>
            <Text style={styles.title}>{community.name}</Text>
            {community.description ? (
              <Text style={styles.desc}>{community.description}</Text>
            ) : null}
            <Text style={styles.meta}>
              {meta?.member_count ?? 0} member
              {(meta?.member_count ?? 0) !== 1 ? "s" : ""}
              {community.is_private ? (
                <Text style={styles.badge}> · Private</Text>
              ) : null}
            </Text>

            {!isMember ? (
              <View style={styles.joinBlock}>
                {community.is_private ? (
                  pendingInviteId ? (
                    <>
                      <Text style={styles.muted}>
                        You&apos;ve been invited to this private community.
                      </Text>
                      <View style={styles.inviteRow}>
                        <Pressable
                          style={styles.declineOutline}
                          onPress={onDeclineInvite}
                          disabled={inviteBusy}
                        >
                          <Text style={styles.declineOutlineText}>Decline</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.joinBtn, inviteBusy && styles.joinBtnDisabled]}
                          onPress={onAcceptInvite}
                          disabled={inviteBusy}
                        >
                          <Text style={styles.joinBtnText}>
                            {inviteBusy ? "…" : "Accept invite"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.muted}>
                      This community is private. Ask an owner for an invite or open
                      Invites from the Communities tab.
                    </Text>
                  )
                ) : (
                  <>
                    <Text style={styles.muted}>
                      Join to see the community vibe, member grid, and activity feed.
                    </Text>
                    <Pressable
                      style={[styles.joinBtn, joining && styles.joinBtnDisabled]}
                      onPress={onJoin}
                      disabled={joining}
                    >
                      <Text style={styles.joinBtnText}>
                        {joining ? "Joining…" : "Join community"}
                      </Text>
                    </Pressable>
                  </>
                )}
                {joinErr ? (
                  <Text style={styles.errSmall}>{joinErr}</Text>
                ) : null}
              </View>
            ) : (
              <>
                <View style={styles.tabBar}>
                  <Pressable
                    onPress={() => setMemberTab("vibe")}
                    style={[
                      styles.tabBtn,
                      memberTab === "vibe" && styles.tabBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        memberTab === "vibe" && styles.tabLabelActive,
                      ]}
                    >
                      Vibe
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMemberTab("people")}
                    style={[
                      styles.tabBtn,
                      memberTab === "people" && styles.tabBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        memberTab === "people" && styles.tabLabelActive,
                      ]}
                    >
                      People
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMemberTab("activity")}
                    style={[
                      styles.tabBtn,
                      memberTab === "activity" && styles.tabBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        memberTab === "activity" && styles.tabLabelActive,
                      ]}
                    >
                      Activity
                    </Text>
                  </Pressable>
                </View>

                {memberTab === "vibe" ? (
                  <CommunityVibeTab
                    communityId={id}
                    canInvite={canInvite}
                    tasteMatch={tasteMatch ?? undefined}
                    insights={insights}
                    insightsPending={insightsPending}
                    albumItems={albumConsensus?.items ?? []}
                    artistItems={artistConsensus?.items ?? []}
                    consensusPending={consensusPending}
                    weekly={weeklyData ?? undefined}
                    weeklyPending={weeklyPending}
                    leaderboard={leaderboard}
                    lbPending={lbPending}
                  />
                ) : memberTab === "people" ? (
                  <CommunityPeopleTab communityId={id} />
                ) : (
                  <View style={styles.activityPane}>
                    <Text style={styles.activityIntro}>
                      What members are doing — grouped when people log several tracks
                      in a row.
                    </Text>
                    {feedPending ? (
                      <ActivityIndicator
                        color={theme.colors.emerald}
                        style={{ marginVertical: 20 }}
                      />
                    ) : (
                      <CommunityActivityFeed
                        feed={feed}
                        feedNextOffset={feedNextOffset}
                        feedLoadingMore={feedLoadingMore}
                        onLoadMore={onLoadMoreFeed}
                      />
                    )}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 32 },
  back: {
    color: theme.colors.emerald,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  centered: { paddingVertical: 24, alignItems: "center" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 8,
  },
  desc: { fontSize: 15, color: theme.colors.muted, lineHeight: 22, marginBottom: 8 },
  meta: { fontSize: 14, color: theme.colors.muted, marginBottom: 16 },
  badge: { color: theme.colors.muted },
  err: { color: theme.colors.danger, padding: 18 },
  errSmall: { color: theme.colors.danger, marginTop: 8, fontSize: 13 },
  muted: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  joinBlock: { gap: 12, marginTop: 8 },
  joinBtn: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  inviteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  declineOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  declineOutlineText: { color: theme.colors.text, fontWeight: "600", fontSize: 15 },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(39,39,42,0.5)",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  tabLabelActive: { color: theme.colors.text },
  activityPane: { marginTop: 4 },
  activityIntro: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
    marginBottom: 14,
  },
});
