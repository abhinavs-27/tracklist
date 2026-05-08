import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import React from "react";
import { theme } from "@/lib/theme";

export type TrackRowItem = {
  id: string;
  name: string;
  /** Optional — shown below the track name in muted text, matching web's artist line. */
  artist?: string | null;
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
  if (listenCount > 0) statsParts.push(`${formatCompactPlays(listenCount)} play${listenCount !== 1 ? "s" : ""}`);
  if (reviewCount > 0) statsParts.push(`${formatCompactPlays(reviewCount)} review${reviewCount !== 1 ? "s" : ""}`);
  if (averageRating != null) statsParts.push(`${averageRating.toFixed(1)}★`);
  // Web shows "—" for zero-stat tracks, not a verbose message
  const statsLine = statsParts.length > 0 ? statsParts.join(" · ") : "—";

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.rowLeft}>
          <Text style={styles.num}>{item.track_number}</Text>
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.artist ? (
              <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.duration} numberOfLines={1}>{duration ?? "—"}</Text>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsMuted} numberOfLines={1}>{statsLine}</Text>
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  rowPressed: {
    backgroundColor: theme.colors.panel,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLeft: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  // Track number — matches web's "text-xs text-zinc-600 tabular-nums"
  num: {
    width: 22,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "400",
    color: "#52525b", // zinc-600
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  // Track name — matches web's "text-sm font-medium text-white"
  name: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  // Artist line — matches web's TrackCard "text-xs text-zinc-500"
  artist: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 1,
  },
  // Duration — matches web's "text-xs text-zinc-600"
  duration: {
    textAlign: "right",
    color: "#52525b", // zinc-600
    fontSize: 12,
    fontWeight: "400",
  },
  // Stats row — matches web's pl-8 indented stats line
  statsRow: {
    marginTop: 2,
    paddingLeft: 32, // indent to align with track name (num width + gap)
  },
  // Stats text — matches web's "text-xs text-zinc-500"
  statsMuted: {
    color: theme.colors.muted,
    fontSize: 11,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 1,
  },
  empty: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});

