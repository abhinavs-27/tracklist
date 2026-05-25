import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { theme } from "@/lib/theme";
import type { ProfileListSummary } from "@/lib/hooks/useProfile";

type Props = {
  lists: ProfileListSummary[];
  isOwnProfile: boolean;
  username: string;
  onPressCreate?: () => void;
};

function ListCard({ list, onPress }: { list: ProfileListSummary; onPress: () => void }) {
  const dateStr = list.created_at
    ? new Date(list.created_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    : null;
  const privacyLabel = list.visibility === "private" ? "Private" : list.visibility === "friends" ? "Friends" : "Public";

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      {/* Cover */}
      <View style={s.cover}>
        {list.image_url ? (
          <Image source={{ uri: list.image_url }} style={s.coverImg} contentFit="cover" />
        ) : (
          <View style={s.coverPh}>
            <Text style={s.coverEmoji}>{list.emoji ?? "♪"}</Text>
          </View>
        )}
      </View>

      {/* Meta */}
      <View style={s.meta}>
        <Text style={s.title} numberOfLines={2}>{list.title}</Text>
        {list.description ? (
          <Text style={s.desc} numberOfLines={1}>{list.description}</Text>
        ) : null}
        <Text style={s.sub}>
          {list.item_count} {list.item_count === 1 ? "item" : "items"}
          {dateStr ? ` · ${dateStr}` : ""}
          {" · "}{privacyLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export function ProfileListsSection({ lists, isOwnProfile, username, onPressCreate }: Props) {
  const router = useRouter();

  return (
    <View style={s.wrap}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.heading}>Your lists</Text>
        <View style={s.headerActions}>
          {isOwnProfile && onPressCreate ? (
            <Pressable
              style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.75 }]}
              onPress={onPressCreate}
            >
              <Text style={s.createBtnText}>+ Create</Text>
            </Pressable>
          ) : null}
          {lists.length > 0 ? (
            <Pressable
              style={({ pressed }) => [s.viewAllBtn, pressed && { opacity: 0.75 }]}
              onPress={() => router.push(`/user/${encodeURIComponent(username)}/lists`)}
            >
              <Text style={s.viewAllText}>View all</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Empty state */}
      {lists.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            {isOwnProfile ? "You haven't created any lists yet." : "No lists yet."}
          </Text>
          {isOwnProfile && onPressCreate ? (
            <Pressable
              style={({ pressed }) => [s.createBtn, s.createBtnLarge, pressed && { opacity: 0.75 }]}
              onPress={onPressCreate}
            >
              <Text style={s.createBtnText}>Create your first list</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={s.list}>
          {lists.map((l) => (
            <ListCard
              key={l.id}
              list={l}
              onPress={() => router.push(`/list/${l.id}`)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  createBtn: {
    borderRadius: 10,
    backgroundColor: theme.colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  createBtnLarge: { marginTop: 12, alignSelf: "flex-start" },
  createBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  viewAllBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewAllText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },

  empty: { gap: 4 },
  emptyText: { fontSize: 14, color: theme.colors.muted },

  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.7)",
    backgroundColor: "rgba(24,24,27,0.5)",
    padding: 12,
  },
  cover: {
    width: 60, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0,
  },
  coverImg: { width: "100%", height: "100%" },
  coverPh: {
    width: "100%", height: "100%",
    backgroundColor: "rgba(39,39,42,0.8)",
    alignItems: "center", justifyContent: "center",
  },
  coverEmoji: { fontSize: 24 },
  meta: { flex: 1, minWidth: 0, gap: 3, paddingTop: 2 },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  desc: { fontSize: 13, color: theme.colors.muted },
  sub: { fontSize: 12, color: "#52525b", marginTop: 4 },
});
