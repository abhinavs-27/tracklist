import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { LeaderboardRow } from "@/components/leaderboard/LeaderboardRow";
import type {
  LeaderboardItem,
  LeaderboardMetricInput,
  LeaderboardTypeInput,
} from "@/lib/hooks/useLeaderboard";
import { useLeaderboard } from "@/lib/hooks/useLeaderboard";
import { YearRangeFilter, type YearRange } from "@/components/filters/YearRangeFilter";
import { NOTIFICATION_BELL_GUTTER } from "@/lib/layout";
import { theme } from "@/lib/theme";

function firstParam(
  v: string | string[] | undefined,
): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function LeaderboardScreen() {
  const params = useLocalSearchParams();
  const typeParam = firstParam(params.type as string | string[] | undefined);
  const metricParam = firstParam(params.metric as string | string[] | undefined);

  const [type, setType] = useState<LeaderboardTypeInput>(() => {
    if (typeParam === "songs") return "songs";
    if (typeParam === "albums") return "albums";
    return "albums";
  });
  const [metric, setMetric] = useState<LeaderboardMetricInput>(() => {
    if (
      metricParam === "popular" ||
      metricParam === "top_rated" ||
      metricParam === "favorited"
    ) {
      return metricParam;
    }
    return "popular";
  });
  const [yearRange, setYearRange] = useState<YearRange>({});

  const { data, isLoading, error } = useLeaderboard({
    type,
    metric,
    startYear: yearRange.startYear,
    endYear: yearRange.endYear,
  });

  const entries: LeaderboardItem[] = data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingLeft: 16,
          paddingRight: 16 + NOTIFICATION_BELL_GUTTER,
          paddingTop: 16,
          paddingBottom: 16,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: theme.text.title.fontSize, fontWeight: theme.text.title.fontWeight, color: theme.colors.text }}>
          Leaderboard
        </Text>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.panelSoft,
            padding: 12,
            gap: 12,
          }}
        >
          <ViewToggle
            value={type}
            onChange={(val) => setType(val as LeaderboardTypeInput)}
            options={[
              { value: "albums", label: "Albums" },
              { value: "songs", label: "Songs" },
            ]}
          />
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              opacity: 0.5,
            }}
          />
          <ViewToggle
            value={metric}
            onChange={(val) => {
              const next = val as LeaderboardMetricInput;
              if (type === "songs" && next === "favorited") {
                setMetric("popular");
                return;
              }
              setMetric(next);
            }}
            options={
              type === "albums"
                ? [
                    { value: "popular", label: "Popular" },
                    { value: "top_rated", label: "Top Rated" },
                    { value: "favorited", label: "Favorited" },
                  ]
                : [
                    { value: "popular", label: "Popular" },
                    { value: "top_rated", label: "Top Rated" },
                  ]
            }
          />
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              opacity: 0.5,
            }}
          />
          <YearRangeFilter value={yearRange} onChange={setYearRange} />
        </View>
      </View>

      {isLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="small" color={theme.colors.emerald} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: theme.colors.danger, fontWeight: "600" }}>
            Failed to load leaderboard.
          </Text>
          <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
            {(error as Error)?.message ?? String(error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            paddingTop: 8,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item, index }) => (
            <LeaderboardRow
              entry={item}
              rank={index + 1}
              metric={metric}
            />
          )}
          ListEmptyComponent={() => (
            <View style={{ paddingTop: 24, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted }}>No results.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

