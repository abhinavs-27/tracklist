import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";
import type { ProfileUser, ProfileStats } from "@/lib/hooks/useProfile";

type BannerAlbum = { artworkUrl: string | null };

type Props = {
  user: ProfileUser;
  stats: ProfileStats;
  streak?: ProfileUser["streak"];
  totalLogs?: number;
  bannerAlbums?: BannerAlbum[];
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
};

export function ProfileHeader({
  user,
  stats,
  streak,
  totalLogs,
  bannerAlbums = [],
  onPressFollowers,
  onPressFollowing,
}: Props) {
  const bannerImages = bannerAlbums.filter((a) => a.artworkUrl).slice(0, 4);
  const hasBanner = bannerImages.length > 0;

  return (
    <View>
      {/* Banner strip */}
      <View style={s.banner}>
        {hasBanner ? (
          <View style={s.bannerStrip}>
            {bannerImages.map((a, i) => (
              <Image
                key={i}
                source={{ uri: a.artworkUrl! }}
                style={s.bannerSlot}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                recyclingKey={a.artworkUrl!}
              />
            ))}
            {/* fill remaining slots */}
            {Array.from({ length: Math.max(0, 4 - bannerImages.length) }).map((_, i) => (
              <View key={`fill-${i}`} style={[s.bannerSlot, s.bannerSlotFill]} />
            ))}
          </View>
        ) : (
          <View style={s.bannerFallback} />
        )}

      </View>

      {/* Body */}
      <View style={s.body}>
        {/* Avatar pulled up over banner */}
        <View style={s.avatarRow}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={s.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          ) : (
            <View style={[s.avatar, s.avatarPh]}>
              <Text style={s.avatarGlyph}>{user.username[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
        </View>

        {/* Username */}
        <Text style={s.username} numberOfLines={1}>{user.username}</Text>

        {/* Followers · Following */}
        <View style={s.followRow}>
          <Pressable
            onPress={onPressFollowers}
            disabled={!onPressFollowers}
            style={({ pressed }) => [s.followBtn, pressed && onPressFollowers ? { opacity: 0.75 } : null]}
          >
            <Text style={s.followValue}>{stats.followers}</Text>
            <Text style={s.followLabel}> followers</Text>
          </Pressable>
          <Text style={s.followDot}>·</Text>
          <Pressable
            onPress={onPressFollowing}
            disabled={!onPressFollowing}
            style={({ pressed }) => [s.followBtn, pressed && onPressFollowing ? { opacity: 0.75 } : null]}
          >
            <Text style={s.followValue}>{stats.following}</Text>
            <Text style={s.followLabel}> following</Text>
          </Pressable>
        </View>

        {/* Bio */}
        {user.bio ? (
          <Text style={s.bio} numberOfLines={4}>{user.bio}</Text>
        ) : null}

        {/* Stats: listens + streak */}
        {(totalLogs && totalLogs > 0) || (streak?.current_streak ?? 0) > 0 ? (
          <View style={s.statsRow}>
            {totalLogs && totalLogs > 0 ? (
              <Text style={s.stat}>
                <Text style={s.statBold}>{totalLogs.toLocaleString()}</Text>
                <Text style={s.statLabel}> listens</Text>
              </Text>
            ) : null}
            {(streak?.current_streak ?? 0) > 0 && (totalLogs && totalLogs > 0) ? (
              <Text style={s.statDot}>·</Text>
            ) : null}
            {(streak?.current_streak ?? 0) > 0 ? (
              <Text style={s.stat}>
                <Text style={s.statBold}>{streak!.current_streak}d</Text>
                <Text style={s.statLabel}> streak</Text>
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const BANNER_H = 120;
const AVATAR_SIZE = 84;
const AVATAR_OVERLAP = 4;

const s = StyleSheet.create({
  banner: { height: BANNER_H, position: "relative" },
  bannerStrip: { flex: 1, flexDirection: "row" },
  bannerSlot: { flex: 1, height: BANNER_H },
  bannerSlotFill: { backgroundColor: "#27272a" },
  bannerFallback: { flex: 1, backgroundColor: "#18181b" },
  bannerFade: {},

  body: { paddingHorizontal: 16, paddingBottom: 4 },

  avatarRow: { marginTop: -AVATAR_OVERLAP },
  avatar: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.panel,
  },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  avatarGlyph: { fontSize: 28, fontWeight: "800", color: theme.colors.muted },

  username: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginTop: 10, letterSpacing: -0.3 },

  followRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4, gap: 2 },
  followBtn: { flexDirection: "row", alignItems: "baseline", paddingVertical: 3, paddingHorizontal: 2 },
  followValue: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  followLabel: { fontSize: 14, color: theme.colors.muted },
  followDot: { fontSize: 14, color: "#52525b", marginHorizontal: 4 },

  bio: { fontSize: 14, color: theme.colors.muted, lineHeight: 20, marginTop: 8 },

  statsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 8 },
  stat: { fontSize: 14 },
  statBold: { fontWeight: "700", color: theme.colors.text },
  statLabel: { color: theme.colors.muted },
  statDot: { fontSize: 14, color: "#52525b" },
});
