import { useQueryClient } from "@tanstack/react-query";
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
import { useCallback } from "react";
import type { CommunityWithMeta } from "../../../types";
import { useMyCommunities } from "../../lib/hooks/useMyCommunities";
import { NOTIFICATION_BELL_GUTTER } from "../../lib/layout";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

export default function CommunitiesTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: communities, isPending, error, refetch, isRefetching } =
    useMyCommunities();

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.communitiesMine() });
    void refetch();
  }, [queryClient, refetch]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <Text style={styles.subtitle}>
          Weekly leaderboards with your crew — not global.
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.push("/communities/invites")}
          >
            <Text style={styles.secondaryBtnText}>Invites</Text>
          </Pressable>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/communities/new")}
          >
            <Text style={styles.primaryBtnText}>Create community</Text>
          </Pressable>
        </View>
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
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: theme.colors.text,
    fontWeight: "600",
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: theme.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  pad: { padding: 18 },
  listPad: { paddingHorizontal: 18, paddingBottom: 24, gap: 10 },
  emptyContainer: { flexGrow: 1, padding: 24, justifyContent: "center" },
  err: { color: theme.colors.danger, fontWeight: "600" },
  link: { color: theme.colors.emerald, marginTop: 8, fontWeight: "600" },
  empty: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
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
