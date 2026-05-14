import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { CommunityActivityFeed } from "@/components/community/CommunityActivityFeed";
import { CommunityPeopleTab } from "@/components/community/CommunityPeopleTab";
import { CommunityVibeTab } from "@/components/community/CommunityVibeTab";
import { CommunityBillboardTab } from "@/components/community/CommunityBillboardTab";
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
  leaveCommunity,
  updateCommunitySettings,
  type CommunityFeedItemV2,
} from "@/lib/api-communities";
import { useAuth } from "@/lib/hooks/useAuth";
import { fetchCommunityTasteMatch } from "@/lib/api-taste";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function CommunityDetailScreen() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    if (!rawId) return "";
    return Array.isArray(rawId) ? rawId[0] : rawId;
  }, [rawId]);

  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [memberTab, setMemberTab] = useState<"billboard" | "community" | "people" | "feed">(
    "billboard",
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
  const canEdit = isMember && meta?.my_role === "admin";
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

  const onLeave = useCallback(async () => {
    if (!id) return;
    setLeaving(true);
    try {
      await leaveCommunity(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.communitiesMine() });
      router.back();
    } catch {
      // ignore — user stays on page
    } finally {
      setLeaving(false);
    }
  }, [id, queryClient, router]);

  const openEdit = useCallback(() => {
    if (!community) return;
    setEditName(community.name);
    setEditDesc(community.description ?? "");
    setEditPrivate(community.is_private);
    setSaveErr(null);
    setEditing(true);
  }, [community]);

  const onSave = useCallback(async () => {
    const trimmed = editName.trim();
    if (trimmed.length < 2) return;
    setSaveErr(null);
    setSaving(true);
    try {
      await updateCommunitySettings(id, {
        name: trimmed,
        description: editDesc.trim() || null,
        is_private: editPrivate,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.community(id) });
      setEditing(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }, [id, editName, editDesc, editPrivate, queryClient]);

  const avatarImageUri = community?.avatar_url
    ? `${API_URL}/api/profile-pictures/community/${id}`
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        nestedScrollEnabled
        stickyHeaderIndices={isMember ? [1] : []}
      >
        {/* ── Child 0: hero + optional non-member message ── */}
        <View style={styles.scrollInner}>
        {metaPending && !community ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.emerald} />
          </View>
        ) : !community ? (
          <Text style={styles.err}>Community not found.</Text>
        ) : (
          <>
            {/* Hero card */}
            <View style={styles.heroCard}>
              {avatarImageUri ? (
                <>
                  <Image
                    source={{ uri: avatarImageUri }}
                    style={[StyleSheet.absoluteFill, styles.heroBlurBg]}
                    blurRadius={40}
                    contentFit="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, styles.heroOverlay]} />
                </>
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.heroGradientFallback]} />
              )}

              {/* Back button */}
              <Pressable onPress={() => router.back()} style={styles.heroBack}>
                <Text style={styles.heroBackText}>← Communities</Text>
              </Pressable>

              {/* Identity */}
              <View style={styles.heroBody}>
                {avatarImageUri ? (
                  <Image
                    source={{ uri: avatarImageUri }}
                    style={styles.heroAvatar}
                    contentFit="cover"
                  />
                ) : null}
                <View style={styles.heroInfo}>
                  <View style={styles.heroNameRow}>
                    <Text style={styles.heroName} numberOfLines={2}>{community.name}</Text>
                    {community.is_private ? (
                      <View style={styles.heroBadge}>
                        <Text style={styles.heroBadgeText}>PRIVATE</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.heroMeta}>
                    {(meta?.member_count ?? 0).toLocaleString()} member{(meta?.member_count ?? 0) !== 1 ? "s" : ""}
                  </Text>
                  {community.description ? (
                    <Text style={styles.heroDesc} numberOfLines={2}>{community.description}</Text>
                  ) : null}
                </View>
              </View>

              {/* Action buttons */}
              {!isMember ? (
                <View style={styles.heroActions}>
                  {community.is_private ? (
                    pendingInviteId ? (
                      <View style={styles.inviteRow}>
                        <Pressable style={styles.declineOutline} onPress={onDeclineInvite} disabled={inviteBusy}>
                          <Text style={styles.declineOutlineText}>Decline</Text>
                        </Pressable>
                        <Pressable style={[styles.joinBtn, inviteBusy && styles.joinBtnDisabled]} onPress={onAcceptInvite} disabled={inviteBusy}>
                          <Text style={styles.joinBtnText}>{inviteBusy ? "…" : "Accept invite"}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.heroPrivateMsg}>Ask a member for an invite.</Text>
                    )
                  ) : (
                    <Pressable style={[styles.joinBtn, joining && styles.joinBtnDisabled]} onPress={onJoin} disabled={joining}>
                      <Text style={styles.joinBtnText}>{joining ? "Joining…" : "Join community"}</Text>
                    </Pressable>
                  )}
                  {joinErr ? <Text style={styles.errSmall}>{joinErr}</Text> : null}
                </View>
              ) : (
                <View style={styles.heroActions}>
                  {canEdit ? (
                    <Pressable style={styles.editBtn} onPress={openEdit}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </Pressable>
                  ) : null}
                  {/* Pill group matching web "● Joined | Leave" */}
                  <View style={styles.memberPillGroup}>
                    <View style={styles.memberPillJoined}>
                      <View style={styles.greenDot} />
                      <Text style={styles.memberPillJoinedText}>Joined</Text>
                    </View>
                    <View style={styles.memberPillSep} />
                    <Pressable
                      style={[styles.memberPillLeave, leaving && { opacity: 0.5 }]}
                      onPress={onLeave}
                      disabled={leaving}
                    >
                      <Text style={styles.memberPillLeaveText}>{leaving ? "…" : "Leave"}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {!isMember ? (
              <View style={{ marginTop: 12 }}>
                {community.is_private && !pendingInviteId ? (
                  <Text style={styles.muted}>
                    This community is private. Ask an owner for an invite or open Invites from the Communities tab.
                  </Text>
                ) : !community.is_private ? (
                  <Text style={styles.muted}>
                    Join to see the community vibe, member grid, and activity feed.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        </View>

        {/* ── Child 1: sticky tab bar (members only) ── */}
        <View style={styles.stickyTabBar}>
          {isMember && community ? (
            <View style={styles.tabBarRow}>
              {(["billboard", "community", "people", "feed"] as const).map((t) => (
                <Pressable key={t} onPress={() => setMemberTab(t)} style={styles.tabBtn}>
                  <Text style={[styles.tabLabel, memberTab === t && styles.tabLabelActive]}>
                    {t === "billboard" ? "Billboard" : t === "community" ? "Community" : t === "people" ? "People" : "Feed"}
                  </Text>
                  {memberTab === t && <View style={styles.tabLine} />}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {/* ── Child 2: tab content ── */}
        {isMember && community ? (
          <View style={[styles.tabContent, styles.scrollInner]}>
            {memberTab === "billboard" ? (
              <CommunityBillboardTab communityId={id} />
            ) : memberTab === "community" ? (
              <CommunityVibeTab communityId={id} />
            ) : memberTab === "people" ? (
              <CommunityPeopleTab communityId={id} />
            ) : (
              <View style={styles.activityPane}>
                <Text style={styles.activityIntro}>
                  What members are doing — grouped when people log several tracks in a row.
                </Text>
                {feedPending ? (
                  <ActivityIndicator color={theme.colors.emerald} style={{ marginVertical: 20 }} />
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
          </View>
        ) : null}
      </ScrollView>

      {/* Edit community modal */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !saving && setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <SafeAreaView style={styles.modalSafe} edges={["top"]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => !saving && setEditing(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Edit community</Text>
              <Pressable onPress={onSave} disabled={saving || editName.trim().length < 2}>
                <Text style={[styles.modalSave, (saving || editName.trim().length < 2) && styles.modalSaveDisabled]}>
                  {saving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Community name"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.modalInput}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Description (optional)</Text>
                <TextInput
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="What's this group about?"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.modalInput, styles.modalTextarea]}
                  multiline
                />
              </View>

              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Private (invite-only)</Text>
                <Switch
                  value={editPrivate}
                  onValueChange={setEditPrivate}
                  trackColor={{ false: theme.colors.border, true: "#065f46" }}
                  thumbColor="#fff"
                />
              </View>

              {saveErr ? <Text style={styles.modalErr}>{saveErr}</Text> : null}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { paddingBottom: 120 },
  scrollInner: { paddingHorizontal: 16 },
  centered: { paddingVertical: 24, alignItems: "center" },
  err: { color: theme.colors.danger, padding: 18 },
  errSmall: { color: theme.colors.danger, marginTop: 8, fontSize: 13 },
  muted: { fontSize: 14, color: theme.colors.muted, lineHeight: 20, marginTop: 4 },

  /* Hero card */
  heroCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#18181b",
  },
  heroBlurBg: { transform: [{ scale: 1.4 }] },
  heroOverlay: { backgroundColor: "rgba(9,9,11,0.72)" },
  heroGradientFallback: {
    backgroundColor: "#052e16",
  },
  heroBack: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  heroBackText: { color: theme.colors.emerald, fontSize: 14, fontWeight: "600" },
  heroBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 0,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroInfo: { flex: 1, gap: 4 },
  heroNameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  heroName: { fontSize: 26, fontWeight: "700", color: theme.colors.text, flex: 1, letterSpacing: -0.3 },
  heroBadge: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroBadgeText: { fontSize: 10, fontWeight: "700", color: "#d4d4d8", letterSpacing: 0.8 },
  heroMeta: { fontSize: 13, color: theme.colors.muted },
  heroDesc: { fontSize: 13, color: theme.colors.muted, lineHeight: 18 },

  /* Actions row */
  heroActions: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  heroPrivateMsg: { fontSize: 13, color: theme.colors.muted },

  editBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(9,9,11,0.70)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },

  /* Joined | Leave pill group — matches web's combined pill */
  memberPillGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(9,9,11,0.70)",
    overflow: "hidden",
  },
  memberPillJoined: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.emerald,
  },
  memberPillJoinedText: { fontSize: 13, fontWeight: "600", color: "#ecfdf5" },
  memberPillSep: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)" },
  memberPillLeave: { paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center" },
  memberPillLeaveText: { fontSize: 13, fontWeight: "500", color: theme.colors.muted },

  joinBtn: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  inviteRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  declineOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  declineOutlineText: { color: theme.colors.text, fontWeight: "600", fontSize: 14 },
  stickyTabBar: {
    backgroundColor: theme.colors.bg,
  },
  tabBarRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    position: "relative",
  },
  tabContent: {
    paddingTop: 16,
  },
  tabBtnActive: {},
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  tabLabelActive: { color: theme.colors.text },
  tabLine: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, borderRadius: 1, backgroundColor: theme.colors.emerald },
  activityPane: { marginTop: 4 },
  activityIntro: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
    marginBottom: 14,
  },

  /* Edit modal */
  modalWrap: { flex: 1, backgroundColor: theme.colors.bg },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  modalCancel: { fontSize: 16, color: theme.colors.muted },
  modalTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  modalSave: { fontSize: 16, fontWeight: "700", color: theme.colors.emerald },
  modalSaveDisabled: { opacity: 0.4 },
  modalBody: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  modalField: { marginBottom: 18 },
  modalLabel: { fontSize: 13, fontWeight: "600", color: theme.colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 13,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.panel,
  },
  modalTextarea: { minHeight: 88, textAlignVertical: "top" },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalErr: { color: theme.colors.danger, fontSize: 14, marginBottom: 12 },
});
