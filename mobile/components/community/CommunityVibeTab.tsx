import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  fetchCommunityConsensus,
  fetchCommunitySignature,
  type CommunityConsensusItem,
} from "@/lib/api-communities";
import { fetchCommunityTasteMatch } from "@/lib/api-taste";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

type ConsensusType = "track" | "album" | "artist";
const PAGE_SIZE = 5;

const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  pioneer:      { bg: "rgba(139,92,246,0.15)", text: "#a78bfa" },
  "deep-diver": { bg: "rgba(16,185,129,0.15)", text: "#34d399" },
  wildcard:     { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  backbone:     { bg: "rgba(14,165,233,0.15)", text: "#38bdf8" },
  curator:      { bg: "rgba(244,63,94,0.15)",  text: "#fda4af" },
};

function SignatureCard({ communityId }: { communityId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["communitySignature", communityId],
    queryFn: () => fetchCommunitySignature(communityId),
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) return <ActivityIndicator color={theme.colors.gold} style={{ marginVertical: 16 }} />;
  if (!data?.hasData) return null;

  const roleColor = ROLE_COLOR[data.role] ?? { bg: "rgba(255,255,255,0.06)", text: theme.colors.muted };

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.sigHeader}>
        <Text style={s.sigLabel}>Your role here</Text>
        <View style={[s.roleBadge, { backgroundColor: roleColor.bg }]}>
          <Text style={[s.roleText, { color: roleColor.text }]}>{data.roleLabel}</Text>
        </View>
      </View>

      {/* Narrative */}
      <Text style={s.narrative}>{data.narrative}</Text>

      {/* Signature genres */}
      {data.signatureGenres.length > 0 && (
        <View style={s.section}>
          <Text style={s.subLabel}>Your signature</Text>
          <View style={s.chipRow}>
            {data.signatureGenres.map((g) => (
              <View key={g} style={s.genreChip}>
                <Text style={s.genreChipText}>{g}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Unique artists */}
      {data.uniqueArtists.length > 0 && (
        <View style={s.section}>
          <Text style={s.subLabel}>Mainly yours</Text>
          <View style={s.chipRow}>
            {data.uniqueArtists.map((a) => (
              <View key={a.id} style={s.artistChip}>
                {a.imageUrl ? (
                  <Image source={{ uri: a.imageUrl }} style={s.artistAvatar} contentFit="cover" />
                ) : (
                  <View style={s.artistAvatarPh}>
                    <Text style={s.artistAvatarPhText}>{(a.name[0] ?? "?").toUpperCase()}</Text>
                  </View>
                )}
                <Text style={s.artistChipText}>{a.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function ConsensusItem({ item, entity, onPress }: { item: CommunityConsensusItem; entity: ConsensusType; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.consensusRow, pressed && { opacity: 0.75 }]} onPress={onPress}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.consensusArt} contentFit="cover" />
      ) : (
        <View style={[s.consensusArt, s.consensusArtPh]} />
      )}
      <View style={s.consensusMeta}>
        <Text style={s.consensusName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.consensusSub} numberOfLines={1}>
          {item.uniqueListeners} listeners · {item.totalPlays} plays
        </Text>
      </View>
    </Pressable>
  );
}

function ConsensusSection({ communityId }: { communityId: string }) {
  const [tab, setTab] = useState<ConsensusType>("track");
  const [page, setPage] = useState(1);
  const router = useRouter();

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isPending } = useQuery({
    queryKey: ["communityConsensus", communityId, tab, page],
    queryFn: () => fetchCommunityConsensus(communityId, {
      type: tab,
      range: "all",
      limit: PAGE_SIZE,
      offset,
    }),
    staleTime: 5 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const hasNext = data?.hasMore ?? false;

  const tabs: { id: ConsensusType; label: string }[] = [
    { id: "track", label: "Songs" },
    { id: "album", label: "Albums" },
    { id: "artist", label: "Artists" },
  ];

  function routeForItem(item: CommunityConsensusItem): string {
    if (tab === "track") return `/song/${item.entityId}`;
    if (tab === "album") return `/album/${item.entityId}`;
    return `/artist/${item.entityId}`;
  }

  function changeTab(t: ConsensusType) {
    setTab(t);
    setPage(1);
  }

  return (
    <View>
      <Text style={s.sectionHeader}>Community Consensus</Text>
      <Text style={s.sectionDesc}>Shared music ranked by breadth of listeners and repeat plays.</Text>

      {/* Tabs */}
      <View style={s.tabRow}>
        {tabs.map((t) => (
          <Pressable key={t.id} style={s.tabBtn} onPress={() => changeTab(t.id)}>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
            {tab === t.id && <View style={s.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      {isPending ? (
        <ActivityIndicator color={theme.colors.gold} style={{ marginTop: 16 }} />
      ) : items.length === 0 ? (
        <Text style={s.empty}>No consensus data yet — log music together.</Text>
      ) : (
        <>
          <View style={s.consensusList}>
            {items.map((item) => (
              <ConsensusItem
                key={item.entityId}
                item={item}
                entity={tab}
                onPress={() => router.push(routeForItem(item) as never)}
              />
            ))}
          </View>

          {/* Pagination */}
          <View style={s.pageRow}>
            <Pressable
              style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <Text style={s.pageBtnText}>Previous</Text>
            </Pressable>
            <Text style={s.pageLabel}>Page {page}</Text>
            <Pressable
              style={[s.pageBtn, !hasNext && s.pageBtnDisabled]}
              onPress={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              <Text style={s.pageBtnText}>Next</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function TasteMatchSection({ communityId }: { communityId: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.communityTasteMatch(communityId),
    queryFn: () => fetchCommunityTasteMatch(communityId),
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return null;
  const score = Math.round(data.score * 100);

  return (
    <View style={s.card}>
      <Text style={s.sigLabel}>Your taste match</Text>
      <View style={s.tasteRow}>
        <Text style={[s.tasteScore, score >= 60 ? s.tasteHigh : score >= 30 ? s.tasteMid : s.tasteLow]}>
          {score}%
        </Text>
        <Text style={s.tasteLabel}>
          {score >= 60 ? "Strong overlap" : score >= 30 ? "Some overlap" : "Very different"}
        </Text>
      </View>
      <Text style={s.tasteSub}>Last 30 days of listens vs this group's combined mix.</Text>
    </View>
  );
}

export function CommunityVibeTab({ communityId }: { communityId: string }) {
  return (
    <View style={s.root}>
      <SignatureCard communityId={communityId} />
      <ConsensusSection communityId={communityId} />
      <TasteMatchSection communityId={communityId} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 20, marginTop: 4 },

  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(63,63,70,0.7)",
    backgroundColor: "rgba(9,9,11,0.4)",
    padding: 16,
  },

  /* Signature */
  sigHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sigLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.muted },
  roleBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 11, fontWeight: "700" },
  narrative: { fontSize: 14, lineHeight: 21, color: "#e4e4e7", marginTop: 10 },
  section: { marginTop: 14 },
  subLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", color: "#52525b", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  genreChip: { borderRadius: 999, backgroundColor: "rgba(63,63,70,0.6)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.06)", paddingHorizontal: 10, paddingVertical: 4 },
  genreChipText: { fontSize: 12, fontWeight: "500", color: "#d4d4d8" },
  artistChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(39,39,42,0.5)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.06)", paddingRight: 10, paddingLeft: 4, paddingVertical: 4 },
  artistAvatar: { width: 22, height: 22, borderRadius: 11 },
  artistAvatarPh: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.panel, alignItems: "center", justifyContent: "center" },
  artistAvatarPhText: { fontSize: 9, fontWeight: "700", color: theme.colors.muted },
  artistChipText: { fontSize: 12, fontWeight: "500", color: "#d4d4d8" },

  /* Consensus */
  sectionHeader: { fontSize: 18, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: theme.colors.muted, marginBottom: 14 },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, marginBottom: 14 },
  tabBtn: { paddingHorizontal: 16, paddingBottom: 10, position: "relative", alignItems: "center" },
  tabLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.muted },
  tabLabelActive: { color: theme.colors.text },
  tabUnderline: { position: "absolute", bottom: 0, left: "10%", right: "10%", height: 2, borderRadius: 1, backgroundColor: theme.colors.gold },
  consensusList: { gap: 4 },
  consensusRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(63,63,70,0.4)" },
  consensusArt: { width: 44, height: 44, borderRadius: 6, flexShrink: 0 },
  consensusArtPh: { backgroundColor: theme.colors.panel },
  consensusMeta: { flex: 1, minWidth: 0 },
  consensusName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  consensusSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  empty: { fontSize: 13, color: theme.colors.muted, marginTop: 8 },

  /* Pagination */
  pageRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 16 },
  pageBtn: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: theme.colors.panel, paddingHorizontal: 16, paddingVertical: 9 },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  pageLabel: { fontSize: 14, color: theme.colors.muted, minWidth: 60, textAlign: "center" },

  /* Taste match */
  tasteRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 10 },
  tasteScore: { fontSize: 36, fontWeight: "800" },
  tasteHigh: { color: theme.colors.gold },
  tasteMid: { color: "#fbbf24" },
  tasteLow: { color: "#f87171" },
  tasteLabel: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  tasteSub: { fontSize: 12, color: theme.colors.muted, marginTop: 6 },
});
