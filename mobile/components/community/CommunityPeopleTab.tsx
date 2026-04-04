import { useInfiniteQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  const { width } = useWindowDimensions();
  const hPad = 36;
  const gap = 10;
  const cardW = Math.max(140, (width - hPad - gap) / 2);

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
      <Text style={styles.err}>Couldn&apos;t load members. Pull to refresh and try again.</Text>
    );
  }

  if (roster.length === 0) {
    return <Text style={styles.muted}>No members yet.</Text>;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.intro}>
        {total} member{total !== 1 ? "s" : ""} · tap a card to open their profile
      </Text>
      <View style={styles.grid}>
        {roster.map((m) => (
          <Pressable
            key={m.user_id}
            style={[styles.card, { width: cardW }]}
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
        ))}
      </View>
      {q.hasNextPage ? (
        <Pressable
          style={styles.moreBtn}
          onPress={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          <Text style={styles.moreBtnText}>
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 4 },
  center: { paddingVertical: 28, alignItems: "center", gap: 10 },
  mutedSmall: { fontSize: 13, color: theme.colors.muted },
  intro: {
    fontSize: 13,
    color: theme.colors.muted,
    lineHeight: 18,
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  card: {
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
  moreBtn: {
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.35)",
  },
  moreBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  muted: { fontSize: 14, color: theme.colors.muted },
  err: { fontSize: 14, color: theme.colors.danger, lineHeight: 20 },
});
