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
import type { CommunityInvitePending, CommunityWithMeta } from "../../../types";
import {
  acceptCommunityInviteApi,
  declineCommunityInviteApi,
  fetchMyCommunityInvites,
} from "../../lib/api-communities";
import { useMyCommunities } from "../../lib/hooks/useMyCommunities";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

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
      <Text style={styles.sectionLabel}>Pending invites</Text>
      {invitesPending ? (
        <View style={styles.invitesLoading}>
          <ActivityIndicator color={theme.colors.emerald} />
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
        Your communities
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <Text style={styles.subtitle}>
          Weekly leaderboards with your crew — not global.
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
          <ActivityIndicator color={theme.colors.emerald} />
        </View>
      ) : error ? (
        <View style={styles.pad}>
          <Text style={styles.err}>Couldn&apos;t load communities.</Text>
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
            <Text style={styles.empty}>
              You&apos;re not in a community yet. Create one to compete with
              friends.
            </Text>
          }
          renderItem={({ item }: { item: CommunityWithMeta }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push(`/communities/${encodeURIComponent(item.id)}`)
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.is_private ? (
                  <Text style={styles.badge}>Private</Text>
                ) : null}
              </View>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {item.member_count} member{item.member_count !== 1 ? "s" : ""}
              </Text>
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
    paddingLeft: 18,
    paddingRight: 18 + NOTIFICATION_BELL_GUTTER,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  primaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  invitesBlock: {
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  sectionLabelSpaced: { marginTop: 4, marginBottom: 8 },
  invitesLoading: { paddingVertical: 12, alignItems: "flex-start" },
  invitesEmpty: {
    fontSize: 14,
    color: theme.colors.muted,
    paddingVertical: 8,
  },
  inviteCards: { gap: 10, marginBottom: 4 },
  inviteCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: theme.colors.panel,
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
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineBtnText: { color: theme.colors.text, fontWeight: "600" },
  acceptBtn: {
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptBtnText: { color: "#fff", fontWeight: "700" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  pad: { padding: 18 },
  listPad: { paddingHorizontal: 0, paddingBottom: 24, gap: 0 },
  emptyContainer: { flexGrow: 1, padding: 24, justifyContent: "center" },
  err: { color: theme.colors.danger, fontWeight: "600" },
  link: { color: theme.colors.emerald, marginTop: 8, fontWeight: "600" },
  empty: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
    marginHorizontal: 18,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.muted,
    backgroundColor: theme.colors.active,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  cardDesc: { marginTop: 6, fontSize: 14, color: theme.colors.muted },
  meta: { marginTop: 8, fontSize: 12, color: theme.colors.muted },
});
