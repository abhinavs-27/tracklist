import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchCommunityPeople, type CommunityPersonRow } from "@/lib/api-communities";
import { theme } from "@/lib/theme";

function PersonRow({ person, rank, onPress }: {
  person: CommunityPersonRow;
  rank: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && { opacity: 0.75 }]}
      onPress={onPress}
    >
      <Text style={s.rank}>{rank}</Text>

      {person.avatarUrl ? (
        <Image source={{ uri: person.avatarUrl }} style={s.avatar} contentFit="cover" />
      ) : (
        <View style={s.avatarPh}>
          <Text style={s.avatarPhText}>{person.username[0]?.toUpperCase() ?? "?"}</Text>
        </View>
      )}

      <View style={s.meta}>
        <View style={s.nameRow}>
          <Text style={s.username} numberOfLines={1}>{person.username}</Text>
          {person.isCreator ? (
            <View style={s.creatorBadge}><Text style={s.creatorText}>Creator</Text></View>
          ) : person.role === "admin" ? (
            <View style={s.adminBadge}><Text style={s.adminText}>Admin</Text></View>
          ) : null}
        </View>
        <Text style={s.stats}>
          {person.totalLogs > 0
            ? `${person.totalLogs} listens · ${person.uniqueArtists} artists`
            : "No listens this week"}
        </Text>
      </View>
    </Pressable>
  );
}

export function CommunityPeopleTab({ communityId }: { communityId: string }) {
  const router = useRouter();

  const { data, isPending, isError } = useQuery({
    queryKey: ["communityPeople", communityId],
    queryFn: () => fetchCommunityPeople(communityId),
    staleTime: 5 * 60 * 1000,
  });

  const people = data?.people ?? [];

  if (isPending) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.colors.emerald} />
      </View>
    );
  }

  if (isError) {
    return <Text style={s.err}>Could not load members.</Text>;
  }

  if (people.length === 0) {
    return <Text style={s.empty}>No members yet.</Text>;
  }

  return (
    <View style={s.root}>
      <Text style={s.heading}>Weekly listen leaders</Text>
      <Text style={s.desc}>Last 7 days · sorted by total listens</Text>
      <View style={s.list}>
        {people.map((person, i) => (
          <PersonRow
            key={person.userId}
            person={person}
            rank={i + 1}
            onPress={() => router.push(`/user/${encodeURIComponent(person.username)}` as Href)}
          />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 0 },
  heading: { fontSize: 18, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  desc: { fontSize: 13, color: theme.colors.muted, marginBottom: 16 },
  list: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    backgroundColor: "rgba(9,9,11,0.4)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rank: { width: 22, fontSize: 14, fontWeight: "600", color: theme.colors.muted, textAlign: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  avatarPh: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.panel, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  avatarPhText: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  meta: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  username: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  creatorBadge: { borderRadius: 6, backgroundColor: "rgba(251,191,36,0.15)", paddingHorizontal: 6, paddingVertical: 2 },
  creatorText: { fontSize: 10, fontWeight: "700", color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.5 },
  adminBadge: { borderRadius: 6, backgroundColor: "rgba(139,92,246,0.15)", paddingHorizontal: 6, paddingVertical: 2 },
  adminText: { fontSize: 10, fontWeight: "700", color: "#a78bfa", textTransform: "uppercase", letterSpacing: 0.5 },
  stats: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  center: { paddingVertical: 24, alignItems: "center" },
  err: { fontSize: 14, color: theme.colors.danger },
  empty: { fontSize: 14, color: theme.colors.muted },
});
