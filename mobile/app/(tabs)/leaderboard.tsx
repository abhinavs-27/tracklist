import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useState } from "react";
import { ViewToggle } from "../../components/ui/ViewToggle";
import { LeaderboardRow } from "../../components/leaderboard/LeaderboardRow";
import type {
  LeaderboardItem,
  LeaderboardMetricInput,
  LeaderboardTypeInput,
} from "../../lib/hooks/useLeaderboard";
import { useLeaderboard } from "../../lib/hooks/useLeaderboard";
import { YearRangeFilter, type YearRange } from "../../components/filters/YearRangeFilter";
import { theme } from "../../lib/theme";

export default function LeaderboardScreen() {
  const [type, setType] = useState<LeaderboardTypeInput>("albums");
  const [metric, setMetric] = useState<LeaderboardMetricInput>("popular");
  const [yearRange, setYearRange] = useState<YearRange>({});

  const metricOptions = type === "albums"
    ? ([
        { value: "popular", label: "Popular" },
        { value: "top_rated", label: "Top Rated" },
        { value: "favorited", label: "Favorited" },
      ] as const)
    : ([
        { value: "popular", label: "Popular" },
        { value: "top_rated", label: "Top Rated" },
      ] as const);

  const { data, isLoading, error } = useLeaderboard({
    type,
    metric,
    startYear: yearRange.startYear,
    endYear: yearRange.endYear,
  });

  const entries: LeaderboardItem[] = data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: theme.text.title.fontSize, fontWeight: theme.text.title.fontWeight, color: theme.colors.text }}>
          Leaderboard
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ViewToggle
              value={type}
              onChange={(val) => setType(val as LeaderboardTypeInput)}
              options={[
                { value: "albums", label: "Albums" },
                { value: "songs", label: "Songs" },
              ]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ViewToggle
              value={metric}
              onChange={(val) => {
                const next = val as LeaderboardMetricInput;
                // Prevent "favorited" when showing songs (backend supports mostFavorited for albums only).
                if (type === "songs" && next === "favorited") {
                  setMetric("popular");
                  return;
                }
                setMetric(next);
              }}
              options={metricOptions as any}
            />
          </View>
        </View>

        <View style={{ marginTop: -4 }}>
          <YearRangeFilter value={yearRange} onChange={setYearRange} />
        </View>
      </View>

      {isLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="small" color="#111827" />
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
            <LeaderboardRow entry={item} rank={index + 1} />
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

