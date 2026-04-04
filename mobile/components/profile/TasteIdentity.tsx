import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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
        }}
      >
        <ActivityIndicator size="small" color={theme.colors.emerald} />
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
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panelSoft,
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>
          Taste identity
        </Text>
        {t.totalLogs > 0 ? (
          <Text style={{ fontSize: 11, color: theme.colors.muted }}>
            From {t.totalLogs} logs
          </Text>
        ) : null}
      </View>

      {hasAny ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(113, 113, 122, 0.5)",
            backgroundColor: "rgba(24, 24, 27, 0.85)",
            padding: 14,
            gap: 10,
          }}
        >
          <Text
            style={{ fontSize: 14, color: theme.colors.text, lineHeight: 20 }}
          >
            {cardInsight}
          </Text>
          <Text style={{ fontSize: 11, color: theme.colors.muted }}>
            {insightSource}
          </Text>
          {cardGenres.length > 0 ? (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {genresLabel}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {cardGenres.slice(0, 12).map((g) => (
                  <View
                    key={g.name}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(139, 92, 246, 0.35)",
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: "rgba(91, 33, 182, 0.18)",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: theme.colors.text }}>
                      {g.name}{" "}
                      <Text style={{ color: theme.colors.muted }}>
                        {Math.round(g.weight)}%
                      </Text>
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: theme.colors.muted }}>
              Genre tags appear as artist metadata fills in — keep logging.
            </Text>
          )}
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: theme.colors.muted }}>
          No listening history yet. Log tracks or sync Last.fm / Spotify to build
          your taste profile.
        </Text>
      )}

      {t.totalLogs > 0 ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(16, 185, 129, 0.25)",
            backgroundColor: "rgba(6, 78, 59, 0.25)",
            padding: 14,
            gap: 6,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: "rgba(52, 211, 153, 0.95)",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Listening style
          </Text>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "800",
              color: theme.colors.text,
              lineHeight: 28,
            }}
          >
            {styleDisplay.title}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.muted,
              lineHeight: 20,
            }}
          >
            {styleDisplay.subtitle}
          </Text>
          <Text style={{ fontSize: 12, color: theme.colors.muted }}>
            ~{t.avgTracksPerSession} tracks / session
          </Text>
        </View>
      ) : null}

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
                    fontSize: 10,
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

      {t.totalLogs > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {t.obscurityScore != null ? (
            <StatPill
              label="Obscurity"
              value={String(t.obscurityScore)}
              hint="0 mainstream · 100 niche"
            />
          ) : null}
          <StatPill
            label="Diversity"
            value={String(t.diversityScore)}
            hint="unique genres (10 = max)"
          />
        </View>
      ) : null}

      {t.topAlbums.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: theme.colors.muted,
              textTransform: "uppercase",
            }}
          >
            Top albums
          </Text>
          {t.topAlbums.slice(0, 6).map((al) => (
            <Pressable
              key={al.id}
              onPress={() => router.push(`/album/${al.id}` as const)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 8,
                backgroundColor: theme.colors.bg,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  overflow: "hidden",
                  backgroundColor: theme.colors.panel,
                }}
              >
                {al.imageUrl ? (
                  <Image
                    source={{ uri: al.imageUrl }}
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
                    <Text style={{ color: theme.colors.muted }}>♪</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: "600", color: theme.colors.text }}
                >
                  {al.name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.muted }}>
                  {al.artistName} · {al.listenCount} plays
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

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
