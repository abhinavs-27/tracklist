import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { theme } from "../../lib/theme";
import type { ProfileUser, ProfileStats } from "../../lib/hooks/useProfile";

type Props = {
  user: ProfileUser;
  stats: ProfileStats;
  streak?: ProfileUser["streak"];
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
};

/**
 * Avatar + username + followers / following (below username, beside avatar) + bio + streak.
 */
export function ProfileHeader({
  user,
  stats,
  streak,
  onPressFollowers,
  onPressFollowing,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {user.avatar_url ? (
          <Image
            source={{ uri: user.avatar_url }}
            style={styles.avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarGlyph}>
              {user.username.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.titleCol}>
          <Text style={styles.username} numberOfLines={1}>
            {user.username}
          </Text>
          <View style={styles.followRow}>
            <Pressable
              onPress={onPressFollowers}
              disabled={!onPressFollowers}
              style={({ pressed }) => [
                styles.followStat,
                pressed && onPressFollowers ? styles.followStatPressed : null,
                !onPressFollowers ? styles.followStatDisabled : null,
              ]}
            >
              <Text style={styles.statValue}>{stats.followers}</Text>
              <Text style={styles.followLabel}>Followers</Text>
            </Pressable>
            <Pressable
              onPress={onPressFollowing}
              disabled={!onPressFollowing}
              style={({ pressed }) => [
                styles.followStat,
                pressed && onPressFollowing ? styles.followStatPressed : null,
                !onPressFollowing ? styles.followStatDisabled : null,
              ]}
            >
              <Text style={styles.statValue}>{stats.following}</Text>
              <Text style={styles.followLabel}>Following</Text>
            </Pressable>
          </View>
          {user.bio ? (
            <Text style={styles.bio} numberOfLines={4}>
              {user.bio}
            </Text>
          ) : null}
        </View>
      </View>

      {streak && streak.current_streak > 0 ? (
        <Text style={styles.streak}>
          🔥{" "}
          <Text style={styles.streakEmphasis}>{streak.current_streak}</Text> day
          listening streak
          {streak.longest_streak > streak.current_streak ? (
            <Text style={styles.streakMuted}>
              {" "}
              (best: {streak.longest_streak})
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: theme.colors.border,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlyph: {
    fontSize: 36,
    fontWeight: "800",
    color: theme.colors.muted,
  },
  titleCol: {
    flex: 1,
    gap: 8,
    paddingTop: 4,
    minWidth: 0,
  },
  username: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.text,
  },
  followRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  followStat: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  followStatPressed: {
    opacity: 0.75,
  },
  followStatDisabled: {
    opacity: 1,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.text,
  },
  followLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  bio: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  streak: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  streakEmphasis: {
    fontWeight: "800",
    color: theme.colors.amber,
  },
  streakMuted: {
    fontSize: 13,
    color: theme.colors.muted,
  },
});
