import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { CommunityTasteMatchCard } from "../../components/community/CommunityTasteMatchCard";
import { CommunityInsights } from "../../components/community/CommunityInsights";
import { InviteMembersPanel } from "../../components/community/InviteMembersPanel";
import {
  acceptCommunityInviteApi,
  declineCommunityInviteApi,
  fetchCommunityDetail,
  fetchCommunityFeed,
  fetchCommunityInsights,
  fetchCommunityLeaderboard,
  joinCommunity,
  type CommunityFeedItemV2,
} from "../../lib/api-communities";
import { useAuth } from "../../lib/hooks/useAuth";
import { fetchCommunityTasteMatch } from "../../lib/api-taste";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

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
  const queryClient = useQueryClient();

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

  const [feedExtra, setFeedExtra] = useState<CommunityFeedItemV2[]>([]);
  const [feedNextOffset, setFeedNextOffset] = useState<number | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  useEffect(() => {
    setFeedExtra([]);
    setFeedNextOffset(feedData?.next_offset ?? null);
  }, [id, feedData]);

  const community = meta?.community;
  const pendingInviteId = meta?.pending_invite_id ?? null;
  const isOwner = meta?.my_role === "owner";
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
      setFeedExtra((prev) => [...prev, ...res.feed]);
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

            {authUser?.id && tasteMatch ? (
              <CommunityTasteMatchCard
                score={tasteMatch.score}
                label={tasteMatch.label}
                shortLabel={tasteMatch.shortLabel}
              />
            ) : null}

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
                      Join to see the weekly leaderboard and activity feed.
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
                {isOwner ? <InviteMembersPanel communityId={id} /> : null}
                {insightsPending && isMember ? (
                  <View style={{ marginBottom: 16, alignItems: "center" }}>
                    <ActivityIndicator color={theme.colors.emerald} />
                    <Text style={[styles.muted, { marginTop: 8 }]}>
                      Loading insights…
                    </Text>
                  </View>
                ) : null}
                {insights && isMember ? (
                  <CommunityInsights insights={insights} />
                ) : null}
                <Text style={styles.sectionTitle}>This week&apos;s leaderboard</Text>
                <Text style={styles.hint}>Last 7 days · by total listens</Text>
                {lbPending ? (
                  <ActivityIndicator
                    color={theme.colors.emerald}
                    style={{ marginVertical: 12 }}
                  />
                ) : leaderboard.length === 0 ? (
                  <Text style={styles.muted}>No listens logged this week yet.</Text>
                ) : (
                  leaderboard.map((row, i) => (
                    <View key={row.userId} style={styles.lbRow}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      {row.avatar_url ? (
                        <Image
                          source={{ uri: row.avatar_url }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatarPh}>
                          <Text style={styles.avatarPhText}>
                            {row.username[0]?.toUpperCase() ?? "?"}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lbName}>{row.username}</Text>
                        <Text style={styles.lbSub}>
                          {row.totalLogs} listens · {row.uniqueArtists} artists
                          {row.streakDays > 0 ? (
                            <Text style={styles.streak}>
                              {" "}
                              · {row.streakDays}d streak
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                    </View>
                  ))
                )}

                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                  Activity
                </Text>
                {feedPending ? (
                  <ActivityIndicator color={theme.colors.emerald} />
                ) : feed.length === 0 ? (
                  <Text style={styles.muted}>No activity yet.</Text>
                ) : (
                  feed.map((item) => (
                    <View key={item.id} style={styles.feedRow}>
                      <View style={styles.feedRowInner}>
                        <Pressable
                          onPress={() =>
                            router.push(
                              `/user/${encodeURIComponent(item.username)}` as const,
                            )
                          }
                        >
                          {item.avatar_url ? (
                            <Image
                              source={{ uri: item.avatar_url }}
                              style={styles.feedAvatar}
                            />
                          ) : (
                            <View style={styles.feedAvatarPh}>
                              <Text style={styles.feedAvatarPhText}>
                                {item.username[0]?.toUpperCase() ?? "?"}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                        <View style={styles.feedBody}>
                          {item.event_type === "review" &&
                          item.entity_href &&
                          item.entity_name ? (
                            <Text style={styles.feedText}>
                              <Text style={styles.feedUsername}>
                                {item.username}
                              </Text>
                              <Text style={styles.feedSep}> · </Text>
                              <Text>Rated </Text>
                              <Text
                                style={styles.feedEntityLink}
                                onPress={() =>
                                  router.push(item.entity_href as Href)
                                }
                              >
                                {item.entity_name}
                              </Text>
                              <Text>{` ${Number(item.payload?.rating) || 0}/5`}</Text>
                            </Text>
                          ) : item.event_type === "feed_story" ||
                            item.event_type === "community_follow" ? (
                            <Text style={styles.feedText}>{item.label}</Text>
                          ) : (
                            <Text style={styles.feedText}>
                              <Text style={styles.feedUsername}>
                                {item.username}
                              </Text>
                              <Text style={styles.feedSep}> · </Text>
                              {item.label}
                            </Text>
                          )}
                          {item.sublabel ? (
                            <Text style={styles.feedSub} numberOfLines={3}>
                              {item.sublabel}
                            </Text>
                          ) : null}
                          {item.comment_count != null &&
                          item.comment_count > 0 ? (
                            <Text style={styles.feedCommentHint}>
                              {item.comment_count} community comment
                              {item.comment_count === 1 ? "" : "s"} (open on
                              web)
                            </Text>
                          ) : null}
                          <Text style={styles.feedTime}>
                            {item.event_type.replace(/_/g, " ")} ·{" "}
                            {formatRelative(item.created_at)}
                          </Text>
                        </View>
                        {item.artwork_url ? (
                          <Pressable
                            onPress={() =>
                              item.entity_href
                                ? router.push(item.entity_href as Href)
                                : undefined
                            }
                            disabled={!item.entity_href}
                          >
                            <Image
                              source={{ uri: item.artwork_url }}
                              style={styles.feedArtwork}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
                {feedNextOffset != null ? (
                  <Pressable
                    onPress={() => void onLoadMoreFeed()}
                    disabled={feedLoadingMore}
                    style={({ pressed }) => [
                      styles.loadMoreBtn,
                      pressed && styles.loadMoreBtnPressed,
                      feedLoadingMore && styles.loadMoreBtnDisabled,
                    ]}
                  >
                    <Text style={styles.loadMoreText}>
                      {feedLoadingMore ? "Loading…" : "Load more"}
                    </Text>
                  </Pressable>
                ) : null}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  hint: { fontSize: 12, color: theme.colors.muted, marginBottom: 10 },
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
  feedRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  feedRowInner: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  feedAvatarPh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarPhText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  feedBody: { flex: 1, minWidth: 0 },
  feedText: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  feedUsername: { fontWeight: "700", color: theme.colors.text },
  feedSep: { color: theme.colors.muted, fontWeight: "400" },
  feedSub: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 4,
    lineHeight: 16,
  },
  feedTime: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
  feedEntityLink: {
    fontSize: 14,
    color: theme.colors.emerald,
    fontWeight: "600",
  },
  feedCommentHint: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 4,
    fontStyle: "italic",
  },
  feedArtwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  loadMoreBtn: {
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.active,
  },
  loadMoreBtnPressed: { opacity: 0.85 },
  loadMoreBtnDisabled: { opacity: 0.5 },
  loadMoreText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
});
