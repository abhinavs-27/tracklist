import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fetchTasteMatches } from "@/lib/api-taste";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

export function SimilarUsersSection() {
  const router = useRouter();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.tasteMatches(),
    queryFn: () => fetchTasteMatches().then((r) => r.matches),
    staleTime: 5 * 60 * 1000,
  });

  const top = data?.slice(0, 8) ?? [];

  return (
    <View>
      <Text style={s.heading}>Similar users</Text>
      <Text style={s.sub}>Based on your last 30 days of listens (artist vectors + cosine similarity).</Text>

      {isPending ? (
        <Text style={s.muted}>Loading…</Text>
      ) : top.length === 0 ? (
        <Text style={s.muted}>No close matches yet — keep logging music.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip}
        >
          {top.map((m) => {
            const pct = Math.round(m.similarityScore * 100);
            return (
              <Pressable
                key={m.userId}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }]}
                onPress={() => router.push(`/user/${encodeURIComponent(m.username)}` as const)}
              >
                {m.avatar_url ? (
                  <Image source={{ uri: m.avatar_url }} style={s.avatar} contentFit="cover" />
                ) : (
                  <View style={s.avatarPh}>
                    <Text style={s.avatarPhText}>{m.username[0]?.toUpperCase() ?? "?"}</Text>
                  </View>
                )}
                <Text style={s.name} numberOfLines={1}>{m.username}</Text>
                <Text style={s.pct}>{pct}%</Text>
                <Text style={s.label} numberOfLines={1}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.muted, lineHeight: 16, marginBottom: 14 },
  muted: { fontSize: 14, color: theme.colors.muted },
  strip: { gap: 12, paddingRight: 8 },
  card: { width: 80, alignItems: "center", gap: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: theme.colors.border },
  avatarPh: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.panel, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  avatarPhText: { fontSize: 24, fontWeight: "700", color: theme.colors.text },
  name: { fontSize: 11, fontWeight: "600", color: theme.colors.text, textAlign: "center", width: "100%" },
  pct: { fontSize: 11, fontWeight: "700", color: theme.colors.gold, textAlign: "center" },
  label: { fontSize: 10, color: theme.colors.muted, textAlign: "center", width: "100%" },
});
