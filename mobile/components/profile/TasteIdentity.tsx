import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AXIS_DISPLAY,
} from "@repo/lib/taste/listening-style";
import { useRouter } from "expo-router";
import { fetcher } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";
import {
  getListeningStyleDisplay,
  normalizeListeningStyle,
} from "@repo/lib/taste/listening-style";
import type { TasteIdentity } from "@repo/lib/taste/types";

type Props = {
  userId: string;
  isOwnProfile?: boolean;
};

export function TasteIdentity({ userId }: Props) {
  const router = useRouter();
  const q = useQuery({
    queryKey: queryKeys.tasteIdentity(userId),
    queryFn: () =>
      fetcher<TasteIdentity>(
        `/api/taste-identity?userId=${encodeURIComponent(userId)}`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (q.isLoading) {
    return (
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.panelSoft,
          padding: 16,
          minHeight: 80,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <ActivityIndicator size="small" color={theme.colors.gold} />
        <Text style={{ fontSize: 12, color: theme.colors.muted }}>Loading taste profile…</Text>
      </View>
    );
  }

  if (q.isError) {
    return (
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.panelSoft,
          padding: 16,
        }}
      >
        <Text
          style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}
        >
          Taste identity
        </Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: theme.colors.danger }}>
          {q.error instanceof Error ? q.error.message : "Could not load"}
        </Text>
      </View>
    );
  }

  const t = q.data;
  if (!t) return null;

  const hasAny =
    t.totalLogs > 0 || t.topArtists.length > 0 || t.topGenres.length > 0;

  const styleKey = normalizeListeningStyle(t.listeningStyle as string);
  const styleDisplay = getListeningStyleDisplay(styleKey);

  const cardInsight = t.recent?.insightWeek?.trim()
    ? t.recent.insightWeek
    : t.summary;
  const cardGenres =
    t.recent?.topGenres7d && t.recent.topGenres7d.length > 0
      ? t.recent.topGenres7d
      : t.topGenres;
  const insightSource = t.recent?.insightWeek?.trim()
    ? "Last 7 days vs last 30 days"
    : "All-time listening";
  const genresLabel = t.recent?.topGenres7d?.length ? "This week" : "Top genres";

  return (
    <View style={{ gap: 16 }}>
      {!hasAny ? (
        <Text style={{ fontSize: 14, color: theme.colors.muted }}>
          No listening history yet. Log tracks or sync Last.fm / Spotify to build your taste profile.
        </Text>
      ) : null}

      {/* 1 — Top artists */}
      {t.topArtists.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: theme.colors.muted,
              textTransform: "uppercase",
            }}
          >
            Top artists
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 8 }}
          >
            {t.topArtists.slice(0, 8).map((a) => (
              <Pressable
                key={a.id}
                onPress={() => router.push(`/artist/${a.id}` as const)}
                style={({ pressed }) => ({
                  width: 76,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.panel,
                    marginBottom: 6,
                  }}
                >
                  {a.imageUrl ? (
                    <Image
                      source={{ uri: a.imageUrl }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 22, color: theme.colors.muted }}>
                        {a.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: theme.colors.text,
                    textAlign: "center",
                  }}
                >
                  {a.name}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.muted,
                    textAlign: "center",
                    marginTop: 2,
                  }}
                >
                  {a.listenCount} plays
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* 2 — Top albums */}
      {t.topAlbums.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Top albums
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
            {t.topAlbums.slice(0, 6).map((al) => (
              <Pressable
                key={al.id}
                onPress={() => router.push(`/album/${al.id}` as const)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 10,
                  borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
                  padding: 8, backgroundColor: "rgba(9,9,11,0.3)", opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }], width: 240,
                })}
              >
                <View style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", backgroundColor: theme.colors.panel, flexShrink: 0 }}>
                  {al.imageUrl ? (
                    <Image source={{ uri: al.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: theme.colors.muted }}>♪</Text></View>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: theme.colors.text }}>{al.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.muted }}>{al.artistName}</Text>
                  <Text style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{al.listenCount} plays</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 3 — Music identity (insight + genres) */}
      {hasAny ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(113,113,122,0.5)", backgroundColor: "rgba(24,24,27,0.85)", padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 14, color: theme.colors.text, lineHeight: 20 }}>{cardInsight}</Text>
          <Text style={{ fontSize: 11, color: theme.colors.muted }}>{insightSource}</Text>
          {cardGenres.length > 0 ? (
            <>
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{genresLabel}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cardGenres.filter(g => g.weight >= 1).slice(0, 12).map((g) => (
                  <View key={g.name} style={{ borderRadius: 999, borderWidth: 1, borderColor: "rgba(63,63,70,0.8)", paddingVertical: 5, paddingHorizontal: 10, backgroundColor: "rgba(24,24,27,0.8)" }}>
                    <Text style={{ fontSize: 12, color: theme.colors.text }}>
                      {g.name}{" "}<Text style={{ color: theme.colors.muted }}>{Math.round(g.weight)}%</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/* 4 — Listening style */}
      {t.totalLogs > 0 ? (
        <StyleCard identity={t} styleDisplay={styleDisplay} />
      ) : null}
    </View>
  );
}

// ── Listening style card with expandable axis breakdown ───────────────────────

type AxisRowProps = {
  label: string;
  leftLabel: string;
  rightLabel: string;
  score: number | null;
  pole: "left" | "right" | "neutral" | null;
};

function AxisRow({ label, leftLabel, rightLabel, score, pole }: AxisRowProps) {
  if (score === null) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }}>
        <Text style={{ width: 72, fontSize: 12, color: "#71717a" }}>{label}</Text>
        <Text style={{ fontSize: 12, color: "#71717a", fontStyle: "italic" }}>No data — requires Spotify connected</Text>
      </View>
    );
  }

  const pct = Math.min(100, Math.max(0, score));
  const poleLabel = pole === "left" ? leftLabel : pole === "right" ? rightLabel : "Balanced";
  const isNeutral = pole === "neutral";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}>
      {/* Axis name */}
      <Text style={{ width: 72, fontSize: 12, color: "#71717a" }}>{label}</Text>

      {/* Track with pole labels above */}
      <View style={{ flex: 1 }}>
        {/* Pole labels above bar — one at each end, no redundancy with result */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
          <Text style={{ fontSize: 11, color: "#52525b" }}>{leftLabel}</Text>
          <Text style={{ fontSize: 11, color: "#52525b" }}>{rightLabel}</Text>
        </View>
        {/* Filled progress track — works reliably with percentage in React Native */}
        <View style={{ height: 4, backgroundColor: "#27272a", borderRadius: 999, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: 4, backgroundColor: "#34d399", borderRadius: 999 }} />
        </View>
      </View>

      {/* Result — single label, no duplication */}
      <Text style={{ width: 58, fontSize: 11, fontWeight: "600", textAlign: "right", color: isNeutral ? "#52525b" : "#e4e4e7" }}>
        {poleLabel}
      </Text>
    </View>
  );
}

function StyleCard({ identity: t, styleDisplay }: { identity: TasteIdentity; styleDisplay: { title: string; subtitle: string } }) {
  const [expanded, setExpanded] = useState(false);
  const axes = t.styleResult?.axes;

  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", backgroundColor: "rgba(6,78,59,0.25)", padding: 14, gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(52,211,153,0.95)", textTransform: "uppercase", letterSpacing: 0.6 }}>Listening style</Text>
      <Text style={{ fontSize: 24, fontWeight: "800", color: "#f4f4f5", lineHeight: 28 }}>{styleDisplay.title}</Text>
      {t.styleResult?.badge ? (
        <View style={{ marginTop: 2, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.1)" }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#6ee7b7" }}>{t.styleResult.badge}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 20 }}>{styleDisplay.subtitle}</Text>

      {axes ? (
        <>
          <Pressable onPress={() => setExpanded(v => !v)} style={{ marginTop: 4, paddingVertical: 8, paddingHorizontal: 4, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 12, color: "#71717a" }}>
              {expanded ? "Hide breakdown ↑" : "Show breakdown ↓"}
            </Text>
          </Pressable>
          {expanded ? (
            <View style={{ marginTop: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)" }}>
              <AxisRow label="Range" leftLabel={AXIS_DISPLAY.range.left} rightLabel={AXIS_DISPLAY.range.right} score={axes.range.score} pole={axes.range.pole} />
              <AxisRow label="Discovery" leftLabel={AXIS_DISPLAY.discovery.left} rightLabel={AXIS_DISPLAY.discovery.right} score={axes.discovery?.score ?? null} pole={axes.discovery?.pole ?? null} />
              <AxisRow label="Mode" leftLabel={AXIS_DISPLAY.mode.left} rightLabel={AXIS_DISPLAY.mode.right} score={axes.mode?.score ?? null} pole={axes.mode?.pole ?? null} />
              <AxisRow label="Signal" leftLabel={AXIS_DISPLAY.signal.left} rightLabel={AXIS_DISPLAY.signal.right} score={axes.signal?.score ?? null} pole={axes.signal?.pole ?? null} />
              <Text style={{ fontSize: 11, color: "#52525b", marginTop: 10 }}>
                Based on {t.totalLogs.toLocaleString()} listens
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// StatPill kept for compatibility but no longer used in main component
function StatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <View
      style={{
        minWidth: 100,
        flexGrow: 1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 10,
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          color: theme.colors.muted,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: theme.colors.text,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 10, color: theme.colors.muted, marginTop: 2 }}>
        {hint}
      </Text>
    </View>
  );
}
