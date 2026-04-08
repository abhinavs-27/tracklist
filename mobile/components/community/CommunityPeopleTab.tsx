import { useInfiniteQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchCommunityMembers,
  type CommunityMemberRosterEntry,
} from "@/lib/api-communities";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

type Props = {
  communityId: string;
};

function pctLabel(n: number): string {
  return `${Math.round(n)}%`;
}

function tasteLine(m: CommunityMemberRosterEntry): string | null {
  if (m.taste_neighbor) {
    const k = m.taste_neighbor.kind === "similar" ? "Similar taste" : "Different vibe";
    return `${k} · ${pctLabel(m.taste_neighbor.similarity_pct)}`;
  }
  if (m.taste_summary) {
    return m.taste_summary.length > 42
      ? `${m.taste_summary.slice(0, 40)}…`
      : m.taste_summary;
  }
  return null;
}

export function CommunityPeopleTab({ communityId }: Props) {
  const router = useRouter();
  const listHeight = useMemo(() => {
    const h = Dimensions.get("window").height;
    return Math.max(400, Math.round(h * 0.58));
  }, []);

  const q = useInfiniteQuery({
    queryKey: queryKeys.communityMembersInfinite(communityId),
    queryFn: ({ pageParam }) =>
      fetchCommunityMembers(communityId, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    enabled: !!communityId,
  });

  const roster = q.data?.pages.flatMap((p) => p.roster) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item: m }: { item: CommunityMemberRosterEntry }) => (
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push(`/user/${encodeURIComponent(m.username)}` as Href)
        }
      >
        <View style={styles.avatarWrap}>
          {m.avatar_url ? (
            <Image source={{ uri: m.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPh}>
              <Text style={styles.avatarPhText}>
                {m.username[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {m.username}
        </Text>
        {m.is_community_creator ? (
          <Text style={styles.creator}>Creator</Text>
        ) : null}
        {m.role === "admin" && !m.is_community_creator ? (
          <Text style={styles.admin}>Admin</Text>
        ) : null}
        <Text style={styles.tasteLine} numberOfLines={2}>
          {tasteLine(m) ?? "—"}
        </Text>
        <View style={styles.topArtistRow}>
          <Text style={styles.topArtistLabel}>Top artist</Text>
          <Text style={styles.topArtistName} numberOfLines={1}>
            {m.top_artists[0] ?? "—"}
          </Text>
        </View>
      </Pressable>
    ),
    [router],
  );

  if (q.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.emerald} />
        <Text style={styles.mutedSmall}>Loading people…</Text>
      </View>
    );
  }

  if (q.isError) {
    return (
      <Text style={styles.err}>
        {"Couldn't load members. Pull to refresh and try again."}
      </Text>
    );
  }

  if (roster.length === 0) {
    return <Text style={styles.muted}>No members yet.</Text>;
  }

  return (
    <FlatList
      data={roster}
      keyExtractor={(m) => m.user_id}
      style={{ height: listHeight }}
      numColumns={2}
      columnWrapperStyle={styles.columnWrap}
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={styles.intro}>
          {total} member{total !== 1 ? "s" : ""} · tap a card to open their profile
        </Text>
      }
      contentContainerStyle={styles.listContent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.35}
      removeClippedSubviews
      ListFooterComponent={
        hasNextPage && isFetchingNextPage ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color={theme.colors.emerald} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  columnWrap: {
    gap: 10,
    marginBottom: 10,
    justifyContent: "space-between",
    flexDirection: "row",
  },
  footerLoading: { paddingVertical: 16, alignItems: "center" },
  center: { paddingVertical: 28, alignItems: "center", gap: 10 },
  mutedSmall: { fontSize: 13, color: theme.colors.muted },
  intro: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
    paddingTop: 14,
    overflow: "hidden",
  },
  avatarWrap: { alignItems: "center", marginBottom: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "rgba(16,185,129,0.35)",
  },
  avatarPh: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatarPhText: { fontSize: 28, fontWeight: "800", color: theme.colors.text },
  name: {
    alignSelf: "stretch",
    width: "100%",
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  creator: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fbbf24",
    textAlign: "center",
    marginTop: 2,
  },
  admin: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.muted,
    textAlign: "center",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tasteLine: {
    alignSelf: "stretch",
    width: "100%",
    fontSize: 12,
    color: theme.colors.emerald,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 16,
    minHeight: 32,
  },
  topArtistRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  topArtistLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  topArtistName: {
    alignSelf: "stretch",
    width: "100%",
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
    marginTop: 4,
  },
  muted: { fontSize: 14, color: theme.colors.muted },
  err: { fontSize: 14, color: theme.colors.danger, lineHeight: 20 },
});
