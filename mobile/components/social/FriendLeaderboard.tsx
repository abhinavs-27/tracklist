import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";
import type { LeaderboardEntry } from "@/lib/hooks/useFriendLeaderboard";

type Props = {
  entries: LeaderboardEntry[];
};

export function FriendLeaderboard({ entries }: Props) {
  const router = useRouter();

  if (entries.length < 2) return null;

  const max = entries[0]?.playCount ?? 1;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Among your friends</Text>
      <View style={styles.list}>
        {entries.map((entry, i) => {
          const pct = Math.max(4, Math.round((entry.playCount / max) * 100));
          return (
            <Pressable
              key={entry.userId}
              onPress={() => router.push(`/user/${encodeURIComponent(entry.username)}` as const)}
              style={({ pressed }) => [
                styles.row,
                entry.isViewer && styles.rowViewer,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={[styles.rank, i === 0 && styles.rankFirst]}>
                {i + 1}
              </Text>
              <View style={styles.avatar}>
                {entry.avatarUrl ? (
                  <Image
                    source={{ uri: entry.avatarUrl }}
                    style={styles.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {entry.username[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View style={styles.info}>
                <View style={styles.infoTop}>
                  <Text
                    numberOfLines={1}
                    style={[styles.username, entry.isViewer && styles.usernameViewer]}
                  >
                    {entry.isViewer ? "You" : entry.username}
                  </Text>
                  <Text style={[styles.plays, entry.isViewer && styles.playsViewer]}>
                    {entry.playCount.toLocaleString()}{" "}
                    {entry.playCount === 1 ? "play" : "plays"}
                  </Text>
                </View>
                <View style={styles.barBg}>
                  <View
                    style={[
                      styles.barFill,
                      entry.isViewer && styles.barFillViewer,
                      { width: `${pct}%` },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  rowViewer: {
    backgroundColor: "rgba(6, 78, 59, 0.25)",
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  rank: {
    width: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  rankFirst: {
    color: "#f59e0b",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  infoTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  username: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  usernameViewer: {
    color: "rgba(52, 211, 153, 0.95)",
  },
  plays: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
    flexShrink: 0,
  },
  playsViewer: {
    color: theme.colors.emerald,
  },
  barBg: {
    height: 3,
    backgroundColor: theme.colors.active,
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: theme.colors.muted,
    borderRadius: 999,
  },
  barFillViewer: {
    backgroundColor: theme.colors.emerald,
  },
});
