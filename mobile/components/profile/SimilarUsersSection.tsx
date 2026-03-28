import { useQuery } from "@tanstack/react-query";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchTasteMatches } from "../../lib/api-taste";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

export function SimilarUsersSection() {
  const router = useRouter();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.tasteMatches(),
    queryFn: () => fetchTasteMatches().then((r) => r.matches),
  });

  if (isPending) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Similar users</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (error || !data?.length) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Similar users</Text>
        <Text style={styles.muted}>
          No close matches yet — keep logging music so we can find listeners with
          a similar artist mix.
        </Text>
      </View>
    );
  }

  const top = data.slice(0, 5);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Similar users</Text>
      <Text style={styles.sub}>Last 30 days · cosine on artist vectors</Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {top.map((m) => {
          const pct = Math.round(m.similarityScore * 100);
          return (
            <Pressable
              key={m.userId}
              style={styles.row}
              onPress={() =>
                router.push(`/user/${encodeURIComponent(m.username)}` as const)
              }
            >
              {m.avatar_url ? (
                <Image source={{ uri: m.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPh}>
                  <Text style={styles.avatarPhText}>
                    {m.username[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <View style={styles.nameBlock}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.username}
                </Text>
                <Text style={styles.meta}>
                  {pct}% · {m.label}
                </Text>
              </View>
              <Text style={styles.pct} numberOfLines={1}>
                {pct}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: theme.colors.panel,
  },
  title: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  sub: { marginTop: 4, fontSize: 12, color: theme.colors.muted },
  muted: { marginTop: 6, fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    minWidth: 0,
  },
  nameBlock: { flex: 1, minWidth: 0 },
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
  name: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  pct: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
});
