import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { CommunityInvitePending, CommunityWithMeta } from "@repo/types";
import {
  acceptCommunityInviteApi,
  declineCommunityInviteApi,
  fetchMyCommunityInvites,
} from "@/lib/api-communities";
import { useMyCommunities } from "@/lib/hooks/useMyCommunities";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

export default function CommunitiesTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const {
    data: communities,
    isPending,
    error,
    refetch,
    isRefetching,
  } = useMyCommunities();

  const {
    data: inviteData,
    isPending: invitesPending,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: queryKeys.communityInvites(),
    queryFn: async () => {
      const r = await fetchMyCommunityInvites();
      return r.invites;
    },
  });

  const invites: CommunityInvitePending[] = inviteData ?? [];

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.communitiesMine() });
    queryClient.invalidateQueries({ queryKey: queryKeys.communityInvites() });
    void refetch();
    void refetchInvites();
  }, [queryClient, refetch, refetchInvites]);

  const onAccept = useCallback(
    async (id: string) => {
      setBusyInviteId(id);
      try {
        await acceptCommunityInviteApi(id);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communityInvites(),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communitiesMine(),
        });
        await refetchInvites();
        await refetch();
      } finally {
        setBusyInviteId(null);
      }
    },
    [queryClient, refetch, refetchInvites],
  );

  const onDecline = useCallback(
    async (id: string) => {
      setBusyInviteId(id);
      try {
        await declineCommunityInviteApi(id);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communityInvites(),
        });
        await refetchInvites();
      } finally {
        setBusyInviteId(null);
      }
    },
    [queryClient, refetchInvites],
  );

  const listHeader = (
    <View style={styles.invitesBlock}>
      <Text style={styles.sectionLabel}>Pending Invites</Text>
      {invitesPending ? (
        <View style={styles.invitesLoading}>
          <ActivityIndicator color={theme.colors.gold} />
        </View>
      ) : invites.length === 0 ? (
        <Text style={styles.invitesEmpty}>No pending invites.</Text>
      ) : (
        <View style={styles.inviteCards}>
          {invites.map((inv) => (
            <View key={inv.id} style={styles.inviteCard}>
              <Text style={styles.inviteTitle}>{inv.community.name}</Text>
              <Text style={styles.inviteSub}>
                {inv.invited_by_username} invited you
                {inv.community.is_private ? " · Private" : ""}
              </Text>
              <View style={styles.inviteActions}>
                <Pressable
                  style={styles.declineBtn}
                  onPress={() => onDecline(inv.id)}
                  disabled={busyInviteId === inv.id}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={styles.acceptBtn}
                  onPress={() => onAccept(inv.id)}
                  disabled={busyInviteId === inv.id}
                >
                  <Text style={styles.acceptBtnText}>
                    {busyInviteId === inv.id ? "…" : "Accept"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
        Your Communities
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <Text style={styles.subtitle}>
          Small-group listening challenges — leaderboards reset weekly.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push("/communities/new")}
        >
          <Text style={styles.primaryBtnText}>Create community</Text>
        </Pressable>
      </View>

      {isPending && !communities ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.gold} />
        </View>
      ) : error ? (
        <View style={styles.pad}>
          <Text style={styles.err}>Couldn't load communities.</Text>
          <Pressable onPress={onRefresh}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={communities ?? []}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={onRefresh}
          ListHeaderComponent={listHeader}
          contentContainerStyle={
            communities?.length === 0 ? styles.emptyContainer : styles.listPad
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={theme.colors.muted} />
              <Text style={styles.empty}>
                You're not in a community yet.{"\n"}Create one or ask a friend for an invite.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: CommunityWithMeta }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push(`/communities/${encodeURIComponent(item.id)}`)
              }
            >
              <View style={styles.cardInner}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.meta}>
                    {item.member_count} member{item.member_count !== 1 ? "s" : ""}
                  </Text>
                  <Ionicons
                    name={item.is_private ? "lock-closed" : "earth-outline"}
                    size={16}
                    color="#71717a"
                  />
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 12,
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -1.5,
    paddingRight: NOTIFICATION_BELL_GUTTER,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: theme.colors.muted,
    lineHeight: 22,
    marginBottom: 4,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: "#4ade80",
    paddingVertical: 18,
    borderRadius: 999,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#052e16",
    fontWeight: "700",
    fontSize: 16,
  },
  invitesBlock: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#71717a",
    marginBottom: 8,
  },
  sectionLabelSpaced: { marginTop: 24, marginBottom: 10 },
  invitesLoading: { paddingVertical: 12, alignItems: "flex-start" },
  invitesEmpty: {
    fontSize: 14,
    fontStyle: "italic",
    color: theme.colors.muted,
    paddingVertical: 4,
  },
  inviteCards: { gap: 10, marginBottom: 4 },
  inviteCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(24,24,27,0.62)",
  },
  inviteTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  inviteSub: { marginTop: 4, fontSize: 13, color: theme.colors.muted },
  inviteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  declineBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  declineBtnText: { color: theme.colors.text, fontWeight: "600" },
  acceptBtn: {
    backgroundColor: theme.colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "700" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  pad: { padding: 18 },
  listPad: { paddingHorizontal: 0, paddingBottom: 100, gap: 0 },
  emptyContainer: { flexGrow: 1, padding: 24, justifyContent: "center" },
  emptyState: { alignItems: "center", gap: 16, paddingVertical: 32 },
  err: { color: theme.colors.danger, fontWeight: "600" },
  link: { color: theme.colors.gold, marginTop: 8, fontWeight: "600" },
  empty: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: "rgba(24,24,27,0.62)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    marginBottom: 10,
    marginHorizontal: 18,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardLeft: {
    flex: 1,
    gap: 4,
  },
  cardRight: {
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  cardDesc: { fontSize: 14, color: theme.colors.muted },
  meta: { fontSize: 12, color: theme.colors.muted },
});
