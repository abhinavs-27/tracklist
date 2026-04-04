import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import React from "react";
import { theme } from "@/lib/theme";

export type TrackRowItem = {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number | null;
  listen_count?: number;
  review_count?: number;
  average_rating?: number | null;
};

function formatDurationMs(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return null;
  const min = Math.floor(durationMs / 60000);
  const sec = Math.floor((durationMs % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatCompactPlays(count: number) {
  if (!Number.isFinite(count)) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${Math.round(count)}`;
}

function TrackRow({ item, onPress }: { item: TrackRowItem; onPress: (id: string) => void }) {
  const duration = formatDurationMs(item.duration_ms);
  const listenCount = item.listen_count ?? 0;
  const reviewCount = item.review_count ?? 0;
  const averageRating = item.average_rating ?? null;

  const statsParts: string[] = [];
  if (listenCount > 0) statsParts.push(`${formatCompactPlays(listenCount)} plays`);
  if (reviewCount > 0) statsParts.push(`${formatCompactPlays(reviewCount)} reviews`);

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.rowLeft}>
          <Text style={styles.num}>{item.track_number}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={styles.duration} numberOfLines={1}>
          {duration ?? "—"}
        </Text>
      </View>

      <View style={styles.statsRow}>
        {statsParts.length > 0 ? (
          <Text style={styles.statsMuted} numberOfLines={1}>
            {statsParts.join(" · ")}
          </Text>
        ) : (
          <Text style={styles.statsMuted} numberOfLines={1}>
            No listens or reviews yet
          </Text>
        )}
        {averageRating != null && (
          <Text style={styles.statsAmber} numberOfLines={1}>
            ★ {averageRating.toFixed(1)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const MemoTrackRow = React.memo(TrackRow);

type Props = {
  tracks: TrackRowItem[];
  onPressTrack: (trackId: string) => void;
  scrollEnabled?: boolean;
  emptyMessage?: string;
};

export function Tracklist({
  tracks,
  onPressTrack,
  scrollEnabled = false,
  emptyMessage = "No tracks found.",
}: Props) {
  if (!tracks.length) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  /** Nested VirtualizedList inside ScrollView often gets zero height; use static rows when not scrolling. */
  if (!scrollEnabled) {
    return (
      <View>
        {tracks.map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 ? <View style={styles.sep} /> : null}
            <MemoTrackRow item={t} onPress={onPressTrack} />
          </React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={tracks}
      keyExtractor={(t) => t.id}
      scrollEnabled={scrollEnabled}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => (
        <MemoTrackRow item={item} onPress={onPressTrack} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "stretch",
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  rowPressed: {
    opacity: 0.85,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  num: {
    width: 28,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.muted,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  duration: {
    width: 64,
    textAlign: "right",
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    gap: 12,
  },
  statsMuted: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  statsAmber: {
    color: theme.colors.amber,
    fontSize: 12,
    fontWeight: "900",
  },
  sep: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 2,
  },
  empty: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});

