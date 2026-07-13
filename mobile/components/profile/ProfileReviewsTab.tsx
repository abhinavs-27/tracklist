"use client";

import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

type DiaryEntry = {
  id: string;
  entity_type: "album" | "song";
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  name: string | null;
  image_url: string | null;
  artist_name: string | null;
  listen_count: number | null;
};

type DiaryResponse = {
  reviews: DiaryEntry[];
  hasLastfm: boolean;
  availableYears: number[];
};

function HalfStarDisplay({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = rating >= i;
        const half = !filled && rating >= i - 0.5;
        return (
          <Text key={i} style={{ color: filled || half ? "#f59e0b" : "#3f3f46", fontSize: 12 }}>
            {filled ? "★" : half ? "½" : "☆"}
          </Text>
        );
      })}
      <Text style={{ color: theme.colors.muted, fontSize: 11, marginLeft: 2 }}>{rating}</Text>
    </View>
  );
}

function groupByMonth(entries: DiaryEntry[]): Array<{ label: string; entries: DiaryEntry[] }> {
  const groups = new Map<string, DiaryEntry[]>();
  for (const r of entries) {
    const d = new Date(r.created_at);
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

function DiaryEntryRow({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const day = new Date(entry.created_at).getDate();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
    >
      <Text style={s.dayNum}>{day}</Text>
      {entry.image_url ? (
        <Image source={{ uri: entry.image_url }} style={s.art} />
      ) : (
        <View style={[s.art, { backgroundColor: "#27272a" }]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={s.name} numberOfLines={1}>{entry.name ?? "Unknown"}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{entry.entity_type === "album" ? "Album" : "Track"}</Text>
          </View>
        </View>
        {entry.artist_name ? (
          <Text style={s.artist} numberOfLines={1}>{entry.artist_name}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 3 }}>
          <HalfStarDisplay rating={entry.rating} />
          {entry.listen_count != null && entry.listen_count > 0 ? (
            <Text style={s.listenCount}>played {entry.listen_count}×</Text>
          ) : null}
        </View>
        {entry.review_text ? (
          <Text style={s.reviewText} numberOfLines={2}>{entry.review_text}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type Props = {
  username: string;
  isOwnProfile: boolean;
  hasLastfm: boolean;
};

export function ProfileReviewsTab({ username, isOwnProfile, hasLastfm }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "albums" | "tracks">("all");

  const { data, isLoading } = useQuery<DiaryResponse>({
    queryKey: ["profile-reviews", username, filter],
    queryFn: () =>
      fetcher(`/api/users/${encodeURIComponent(username)}/reviews?filter=${filter}`),
    staleTime: 2 * 60 * 1000,
  });

  const reviews = data?.reviews ?? [];
  const grouped = groupByMonth(reviews);
  const showLastfmNudge = isOwnProfile && !hasLastfm && reviews.length >= 3;

  return (
    <View style={s.container}>
      {showLastfmNudge ? (
        <View style={s.nudge}>
          <Text style={s.nudgeText}>
            Connect Last.fm to see how many times you&apos;ve listened to each of these.
          </Text>
        </View>
      ) : null}

      <View style={s.filterRow}>
        {(["all", "albums", "tracks"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
          >
            <Text style={[s.filterLabel, filter === f && s.filterLabelActive]}>
              {f === "all" ? "All" : f === "albums" ? "Albums" : "Tracks"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.colors.gold} style={{ marginTop: 40 }} />
      ) : reviews.length === 0 ? (
        <Text style={s.empty}>
          {isOwnProfile ? "Rate some albums to build your diary." : "No reviews yet."}
        </Text>
      ) : (
        grouped.map(({ label, entries }) => (
          <View key={label} style={{ marginBottom: 20 }}>
            <Text style={s.monthLabel}>{label}</Text>
            {entries.map((entry) => (
              <DiaryEntryRow
                key={entry.id}
                entry={entry}
                onPress={() =>
                  router.push(
                    (entry.entity_type === "album"
                      ? `/album/${entry.entity_id}`
                      : `/song/${entry.entity_id}`) as never,
                  )
                }
              />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  nudge: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.8)",
    backgroundColor: "rgba(24,24,27,0.5)",
    padding: 12,
    marginBottom: 12,
  },
  nudgeText: { fontSize: 13, color: theme.colors.muted },
  filterRow: { flexDirection: "row", gap: 6, marginBottom: 16 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.8)",
    backgroundColor: "rgba(24,24,27,0.5)",
  },
  filterBtnActive: {
    borderColor: theme.colors.gold,
    backgroundColor: "rgba(200,151,58,0.1)",
  },
  filterLabel: { fontSize: 13, fontWeight: "500", color: theme.colors.muted },
  filterLabelActive: { color: "#C8973A" },
  empty: { textAlign: "center", color: "#52525b", fontSize: 14, marginTop: 40 },
  monthLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#52525b",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  dayNum: { width: 22, textAlign: "right", fontSize: 13, color: "#52525b", paddingTop: 3 },
  art: { width: 40, height: 40, borderRadius: 6 },
  name: { fontSize: 14, fontWeight: "600", color: theme.colors.text, flexShrink: 1 },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "#27272a" },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  artist: { fontSize: 12, color: theme.colors.muted, marginTop: 1 },
  listenCount: { fontSize: 11, color: "#52525b" },
  reviewText: { fontSize: 12, color: theme.colors.muted, marginTop: 4, lineHeight: 16 },
});
