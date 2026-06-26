// mobile/components/profile/TasteMatchCard.tsx
// @ts-ignore — @types/react resolution breaks under this tsconfig's paths wildcard; pre-existing project-wide issue
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import type {
  TasteMatchResponse,
  TasteMatchSharedArtist,
} from "@repo/types";
import { theme } from "@/lib/theme";
import { usePrefetchAlbum, usePrefetchArtist } from "@/lib/hooks/usePrefetch";

const VIOLET = "#8b5cf6";

type Props = {
  match: TasteMatchResponse;
  profileUserId: string;
  username: string;
};

export function TasteMatchCard({ match, profileUserId, username }: Props) {
  const router = useRouter();
  const prefetchArtist = usePrefetchArtist();
  const prefetchAlbum = usePrefetchAlbum();
  const [imageBusy, setImageBusy] = useState(false);

  const sharedGenres = match.sharedGenres.map((g) => ({
    name: g.name,
    right: `You ${Math.round(g.weightUserA)}% · Them ${Math.round(g.weightUserB)}%`,
  }));
  const uniqueA = match.uniqueGenresUserA.map((g) => ({ name: g.name, right: `${Math.round(g.weight)}%` }));
  const uniqueB = match.uniqueGenresUserB.map((g) => ({ name: g.name, right: `${Math.round(g.weight)}%` }));
  const sh = match.startHere;
  const showStartHere =
    !!sh && (sh.artistsToExplore.length > 0 || !!sh.topAlbum || !!sh.topTrack);

  const shareLink = useCallback(async () => {
    const base = process.env.EXPO_PUBLIC_API_URL ?? "https://tracklist.lol";
    try {
      await Share.share({
        message: `Compare our music taste on Tracklist — ${base}/@${username}`,
      });
    } catch {
      /* user cancelled */
    }
  }, [username]);

  const shareImage = useCallback(async () => {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "";
      const dest = (FileSystem.cacheDirectory ?? "") + "tracklist-taste-match.png";
      const result = await FileSystem.downloadAsync(
        `${apiBase}/api/taste-match/card?userB=${encodeURIComponent(profileUserId)}`,
        dest,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (result.status !== 200) {
        await shareLink();
        return;
      }
      const Sharing = await import("expo-sharing");
      await Sharing.shareAsync(dest, {
        mimeType: "image/png",
        dialogTitle: "Share your taste match",
      });
    } catch {
      await shareLink();
    } finally {
      setImageBusy(false);
    }
  }, [imageBusy, profileUserId, shareLink]);

  return (
    <View style={s.card}>
      {/* Header: score + summary */}
      <View style={s.header}>
        <Text style={s.eyebrow}>TASTE MATCH</Text>
        <View style={s.scoreRow}>
          <Text style={s.score}>{match.score}</Text>
          <Text style={s.scorePct}>%</Text>
        </View>
        <Text style={s.summary}>{match.summary}</Text>

        {/* Connect row */}
        <View style={s.connectRow}>
          <Pressable style={({ pressed }: { pressed: boolean }) => [s.connectBtn, pressed && s.pressed]} onPress={() => void shareLink()}>
            <Text style={s.connectBtnText}>Share taste match</Text>
          </Pressable>
          <Pressable
            style={({ pressed }: { pressed: boolean }) => [s.connectBtn, (pressed || imageBusy) && s.pressed]}
            onPress={() => void shareImage()}
            disabled={imageBusy}
          >
            {imageBusy ? <ActivityIndicator size="small" color={theme.colors.text} /> : <Text style={s.connectBtnText}>Share image</Text>}
          </Pressable>
        </View>
      </View>

      {/* Shared taste */}
      <View style={s.section}>
        <Text style={s.sectionHeading}>SHARED TASTE</Text>
        {match.sharedArtists.length > 0 ? (
          <View style={{ gap: 10 }}>
            {match.sharedArtists.map((a) => (
              <SharedArtistRow
                key={a.id}
                artist={a}
                onPress={() => router.push(`/artist/${a.id}` as const)}
                onPressIn={() => { prefetchArtist(a.id); }}
              />
            ))}
          </View>
        ) : (
          <Text style={s.muted}>No shared top artists yet — log more and compare again.</Text>
        )}
        {sharedGenres.length > 0 ? <PillGroup label="Shared genres" pills={sharedGenres} /> : null}
      </View>

      {/* Differences */}
      {uniqueA.length > 0 || uniqueB.length > 0 ? (
        <View style={s.section}>
          <Text style={s.sectionHeading}>DIFFERENCES</Text>
          {uniqueA.length > 0 ? <PillGroup label="Only on you" pills={uniqueA} /> : null}
          {uniqueB.length > 0 ? <PillGroup label="Only on them" pills={uniqueB} /> : null}
        </View>
      ) : null}

      {/* Discovery */}
      <View style={s.section}>
        <Text style={s.sectionHeading}>DISCOVERY</Text>
        <View style={s.metricRow}>
          <Metric label="Artist overlap" value={`${match.overlapScore}%`} color={theme.colors.gold} />
          <Metric label="Genre overlap" value={`${match.genreOverlapScore}%`} color={VIOLET} />
          <Metric label="New to you" value={`${match.discoveryScore}%`} color={theme.colors.amber} />
        </View>

        {showStartHere && sh ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <Text style={s.startHereLabel}>START HERE</Text>
            {sh.artistsToExplore.length > 0 ? (
              <View style={s.chipWrap}>
                {sh.artistsToExplore.map((a) => (
                  <Pressable
                    key={a.id}
                    style={({ pressed }: { pressed: boolean }) => [s.chip, pressed && s.pressed]}
                    onPress={() => router.push(`/artist/${a.id}` as const)}
                    onPressIn={() => { prefetchArtist(a.id); }}
                  >
                    <Text style={s.chipText} numberOfLines={1}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {sh.topAlbum ? (
              <Pressable
                style={({ pressed }: { pressed: boolean }) => [s.entryRow, pressed && s.pressed]}
                onPress={() => router.push(`/album/${sh.topAlbum!.id}` as const)}
                onPressIn={() => { prefetchAlbum(sh.topAlbum!.id); }}
              >
                {sh.topAlbum.imageUrl ? (
                  <Image source={{ uri: sh.topAlbum.imageUrl }} style={s.entryArt} contentFit="cover" />
                ) : (
                  <View style={[s.entryArt, s.entryArtPh]}><Text style={s.muted}>♪</Text></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryKicker}>Most-played album</Text>
                  <Text style={s.entryName} numberOfLines={1}>{sh.topAlbum.name}</Text>
                  <Text style={s.entrySub} numberOfLines={1}>{sh.topAlbum.artistName} · {sh.topAlbum.playCount} plays</Text>
                </View>
              </Pressable>
            ) : null}
            {sh.topTrack ? (
              <Pressable
                style={({ pressed }: { pressed: boolean }) => [s.entryRow, pressed && s.pressed]}
                disabled={!sh.topTrack.albumId}
                onPress={() => sh.topTrack!.albumId && router.push(`/album/${sh.topTrack!.albumId}` as const)}
                onPressIn={() => { if (sh.topTrack!.albumId) prefetchAlbum(sh.topTrack!.albumId); }}
              >
                <View style={[s.entryArt, s.entryArtPh]}><Text style={s.muted}>♪</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryKicker}>Most-played track</Text>
                  <Text style={s.entryName} numberOfLines={1}>{sh.topTrack.name}</Text>
                  <Text style={s.entrySub} numberOfLines={1}>
                    {[sh.topTrack.artistName, sh.topTrack.albumName].filter(Boolean).join(" · ")} · {sh.topTrack.playCount} plays
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SharedArtistRow({
  artist: a,
  onPress,
  onPressIn,
}: {
  artist: TasteMatchSharedArtist;
  onPress: () => void;
  onPressIn: () => void;
  // key declared to allow React's list `key` prop when @types/react JSX attributes don't strip it
  key?: string | number | null;
}) {
  const flexYou = Math.max(1, a.listenCountUserA);
  const flexThem = Math.max(1, a.listenCountUserB);
  const lead = a.listenCountUserA === a.listenCountUserB ? "tie" : a.listenCountUserA > a.listenCountUserB ? "you" : "them";
  return (
    <Pressable style={({ pressed }: { pressed: boolean }) => [s.artistRow, pressed && s.pressed]} onPress={onPress} onPressIn={onPressIn}>
      <View style={s.artistAvatar}>
        {a.imageUrl ? (
          <Image source={{ uri: a.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={s.muted}>♪</Text></View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={s.artistName} numberOfLines={1}>{a.name}</Text>
          <Text style={[s.leadBadge, lead === "you" ? s.leadYou : lead === "them" ? s.leadThem : s.leadTie]}>
            {lead === "you" ? "You lead" : lead === "them" ? "They lead" : "Neck & neck"}
          </Text>
        </View>
        <View style={s.splitTrack}>
          <View style={{ flex: flexYou, backgroundColor: theme.colors.gold }} />
          <View style={{ flex: flexThem, backgroundColor: VIOLET }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>
          <Text style={s.splitLabel}>You {a.listenCountUserA}</Text>
          <Text style={s.splitLabel}>Them {a.listenCountUserB}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function PillGroup({ label, pills }: { label: string; pills: { name: string; right: string }[] }) {
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <Text style={s.pillGroupLabel}>{label}</Text>
      <View style={s.chipWrap}>
        {pills.map((p, i) => (
          <View key={`${p.name}-${i}`} style={s.pill}>
            <Text style={s.pillText}>{p.name} <Text style={s.muted}>{p.right}</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.metricCell}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "rgba(20,17,8,0.6)", overflow: "hidden" },
  header: { padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, backgroundColor: "rgba(74,44,14,0.18)" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: theme.colors.muted },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 8 },
  score: { fontSize: 64, fontWeight: "800", color: theme.colors.text, lineHeight: 64 },
  scorePct: { fontSize: 30, fontWeight: "700", color: theme.colors.muted, marginBottom: 6, marginLeft: 4 },
  summary: { fontSize: 15, color: theme.colors.text, lineHeight: 21, marginTop: 12 },
  connectRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  connectBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(63,63,70,0.8)", backgroundColor: "rgba(9,9,11,0.5)", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  connectBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  pressed: { opacity: 0.7 },
  section: { padding: 18, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.04)" },
  sectionHeading: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: theme.colors.muted, marginBottom: 8 },
  muted: { fontSize: 13, color: theme.colors.muted },
  artistRow: { flexDirection: "row", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "rgba(9,9,11,0.4)", padding: 10 },
  artistAvatar: { width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.panel },
  artistName: { fontSize: 14, fontWeight: "600", color: theme.colors.text, flexShrink: 1 },
  leadBadge: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  leadYou: { backgroundColor: theme.colors.gold, color: "#000" },
  leadThem: { backgroundColor: "rgba(139,92,246,0.18)", color: "#c4b5fd" },
  leadTie: { backgroundColor: "rgba(63,63,70,0.7)", color: theme.colors.muted },
  splitTrack: { flexDirection: "row", height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "#27272a", marginTop: 8 },
  splitLabel: { fontSize: 11, color: theme.colors.muted },
  pillGroupLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(63,63,70,0.8)", paddingVertical: 5, paddingHorizontal: 10, backgroundColor: "rgba(24,24,27,0.8)" },
  pillText: { fontSize: 12, color: theme.colors.text },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "rgba(9,9,11,0.5)", maxWidth: 160 },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
  metricRow: { flexDirection: "row", gap: 8 },
  metricCell: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "rgba(9,9,11,0.5)", padding: 12 },
  metricLabel: { fontSize: 10, color: theme.colors.muted, textTransform: "uppercase" },
  metricValue: { fontSize: 22, fontWeight: "700", marginTop: 6 },
  startHereLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.gold, letterSpacing: 0.5 },
  entryRow: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "rgba(9,9,11,0.5)", padding: 10 },
  entryArt: { width: 48, height: 48, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.panel },
  entryArtPh: { alignItems: "center", justifyContent: "center" },
  entryKicker: { fontSize: 10, color: theme.colors.muted, textTransform: "uppercase" },
  entryName: { fontSize: 14, fontWeight: "600", color: theme.colors.text, marginTop: 2 },
  entrySub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
});
