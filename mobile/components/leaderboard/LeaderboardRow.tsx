import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Artwork } from "@/components/media/Artwork";
import type { LeaderboardItem } from "@/lib/hooks/useLeaderboard";
import { theme } from "@/lib/theme";

function formatCompact(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${Math.round(n)}`;
}

type Props = {
  entry: LeaderboardItem;
  rank: number; // 1-based
  /** When `favorited`, always show favorite count (same as leaderboard metric). */
  metric?: "popular" | "top_rated" | "favorited";
};

export function LeaderboardRow({ entry, rank, metric }: Props) {
  const router = useRouter();

  const base = entry.entityType === "album" ? "/album" : "/song";

  return (
    <Pressable
      onPress={() => router.push(`${base}/${entry.id}` as const)}
      style={({ pressed }) => [
        {
          backgroundColor: theme.colors.panel,
          borderRadius: 16,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 28, alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: theme.colors.muted, fontWeight: "600" }}>
            #{rank}
          </Text>
        </View>

        <Artwork src={entry.artworkUrl} size="sm" />

        <View style={{ flex: 1, gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 14, fontWeight: "700", color: theme.colors.text }}
          >
            {entry.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: theme.colors.muted, marginTop: -2 }}
          >
            {entry.artist}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {entry.rating != null && metric !== "favorited" && (
              <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: "600" }}>
                Rating {Number(entry.rating).toFixed(1)}
              </Text>
            )}
            {metric === "favorited" ? (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.emerald,
                    fontWeight: "700",
                  }}
                >
                  Favorites {formatCompact(entry.favoriteCount ?? 0)}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.muted, fontWeight: "600" }}>
                  Plays {formatCompact(entry.playCount)}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: "600" }}>
                  Plays {formatCompact(entry.playCount)}
                </Text>
                {entry.favoriteCount != null && (
                  <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: "600" }}>
                    Favorites {formatCompact(entry.favoriteCount)}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

