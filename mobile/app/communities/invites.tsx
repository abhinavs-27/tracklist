import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import type { CommunityInvitePending } from "../../../types";
import {
  acceptCommunityInviteApi,
  declineCommunityInviteApi,
  fetchMyCommunityInvites,
} from "../../lib/api-communities";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

export default function CommunityInvitesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: queryKeys.communityInvites(),
    queryFn: async () => {
      const r = await fetchMyCommunityInvites();
      return r.invites;
    },
  });

  const invites: CommunityInvitePending[] = data ?? [];

  const onAccept = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await acceptCommunityInviteApi(id);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communityInvites(),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communitiesMine(),
        });
        await refetch();
      } finally {
        setBusyId(null);
      }
    },
    [queryClient, refetch],
  );

  const onDecline = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await declineCommunityInviteApi(id);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.communityInvites(),
        });
        await refetch();
      } finally {
        setBusyId(null);
      }
    },
    [queryClient, refetch],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Pressable onPress={() => router.back()} style={styles.backWrap}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Community invites</Text>
      <Text style={styles.sub}>Accept to join private groups.</Text>

      {isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.emerald} />
        </View>
      ) : error ? (
        <Text style={styles.err}>Couldn&apos;t load invites.</Text>
      ) : invites.length === 0 ? (
        <Text style={styles.muted}>No pending invites.</Text>
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {invites.map((inv) => (
            <View key={inv.id} style={styles.card}>
              <Text style={styles.cardTitle}>{inv.community.name}</Text>
              <Text style={styles.cardSub}>
                {inv.invited_by_username} invited you
                {inv.community.is_private ? " · Private" : ""}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={styles.decline}
                  onPress={() => onDecline(inv.id)}
                  disabled={busyId === inv.id}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={styles.accept}
                  onPress={() => onAccept(inv.id)}
                  disabled={busyId === inv.id}
                >
                  <Text style={styles.acceptText}>
                    {busyId === inv.id ? "…" : "Accept"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 18 },
  backWrap: { marginBottom: 8 },
  back: { color: theme.colors.emerald, fontSize: 16, fontWeight: "600" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.text,
  },
  sub: { marginTop: 6, fontSize: 14, color: theme.colors.muted },
  centered: { marginTop: 24, alignItems: "center" },
  err: { color: theme.colors.danger, marginTop: 16 },
  muted: { marginTop: 16, color: theme.colors.muted },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: theme.colors.panel,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  cardSub: { marginTop: 4, fontSize: 13, color: theme.colors.muted },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  decline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  declineText: { color: theme.colors.text, fontWeight: "600" },
  accept: {
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptText: { color: "#fff", fontWeight: "700" },
});
