// mobile/components/profile/TasteMatchSection.tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchTasteMatch } from "@/lib/api-taste";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";
import { TasteMatchCard } from "./TasteMatchCard";

type Props = {
  profileUserId: string;
  viewerId: string;
  username: string;
};

export function TasteMatchSection({ profileUserId, viewerId, username }: Props) {
  const [compared, setCompared] = useState(false);

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.tasteMatch(viewerId, profileUserId),
    queryFn: () => fetchTasteMatch(profileUserId),
    enabled: compared,
    staleTime: 5 * 60 * 1000,
  });

  // Idle — show the prompt + button (no network yet).
  if (!compared) {
    return (
      <View style={s.prompt}>
        <Text style={s.title}>Taste match</Text>
        <Text style={s.sub}>See how your listening overlaps with @{username} — shared artists, differences, and what to discover.</Text>
        <Pressable style={({ pressed }: { pressed: boolean }) => [s.cta, pressed && { opacity: 0.8 }]} onPress={() => setCompared(true)}>
          <Text style={s.ctaText}>Compare taste</Text>
        </Pressable>
      </View>
    );
  }

  if (isFetching) {
    return (
      <View style={[s.prompt, { alignItems: "center", gap: 10 }]}>
        <ActivityIndicator size="small" color={theme.colors.gold} />
        <Text style={s.sub}>Comparing taste…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.prompt}>
        <Text style={s.title}>Taste match</Text>
        <Text style={s.errorText}>{error instanceof Error ? error.message : "Couldn't load taste comparison"}</Text>
        <Pressable style={({ pressed }: { pressed: boolean }) => [s.cta, pressed && { opacity: 0.8 }]} onPress={() => void refetch()}>
          <Text style={s.ctaText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!data) return null;

  if (data.insufficientData) {
    return (
      <View style={s.prompt}>
        <Text style={s.title}>Taste match</Text>
        <Text style={s.sub}>{data.summary}</Text>
      </View>
    );
  }

  return <TasteMatchCard match={data} profileUserId={profileUserId} username={username} />;
}

const s = StyleSheet.create({
  prompt: { borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "rgba(20,17,8,0.5)", padding: 18, gap: 10 },
  title: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  sub: { fontSize: 13, color: theme.colors.muted, lineHeight: 18 },
  errorText: { fontSize: 13, color: theme.colors.danger, lineHeight: 18 },
  cta: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.gold, paddingHorizontal: 18, marginTop: 4 },
  ctaText: { fontSize: 14, fontWeight: "700", color: "#000" },
});
