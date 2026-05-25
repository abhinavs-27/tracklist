import React from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { formatRelativeTime } from "@/lib/time";

export type Review = {
  id: string;
  user_id?: string;
  username: string | null;
  rating: number;
  review_text: string | null;
  created_at?: string;
  avatar_url?: string | null;
  like_count?: number;
};

type Props = {
  reviews: Review[];
  averageRating?: number | null;
  reviewCount?: number;
  viewAllLabel?: string;
  onViewAllPress?: () => void;
};

function StarDisplay({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 !== 0;
  return (
    <Text style={s.stars}>
      {"★".repeat(full)}{half ? "½" : ""}
    </Text>
  );
}

function Avatar({ username, avatarUrl }: { username: string | null; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />;
  }
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <Text style={s.avatarLetter}>{(username ?? "?")[0]?.toUpperCase()}</Text>
    </View>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const username = review.username ?? "Anonymous";
  return (
    <View style={s.card}>
      <View style={s.cardInner}>
        {/* Avatar */}
        <Avatar username={review.username} avatarUrl={review.avatar_url} />

        <View style={s.cardBody}>
          {/* Username + stars + date on one row */}
          <View style={s.headerRow}>
            <Text style={s.username} numberOfLines={1}>{username}</Text>
            <StarDisplay rating={review.rating} />
            {review.created_at && (
              <Text style={s.date}>{formatRelativeTime(review.created_at)}</Text>
            )}
          </View>

          {/* Review text */}
          {review.review_text ? (
            <Text style={s.reviewText} numberOfLines={5}>{review.review_text}</Text>
          ) : null}

          {/* Like count */}
          <View style={s.engagementRow}>
            <View style={s.likeBtn}>
              <Ionicons name="heart-outline" size={14} color={theme.colors.muted} />
              {(review.like_count ?? 0) > 0 && (
                <Text style={s.likeCount}>{review.like_count}</Text>
              )}
            </View>
            <View style={s.likeBtn}>
              <Ionicons name="chatbubble-outline" size={13} color={theme.colors.muted} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ReviewList({ reviews, averageRating, reviewCount, viewAllLabel = "View all reviews", onViewAllPress }: Props) {
  const visible = reviews.slice(0, 5);

  return (
    <View style={s.wrap}>
      {/* Stats summary line */}
      {(averageRating != null || (reviewCount ?? 0) > 0) && (
        <View style={s.statsLine}>
          {averageRating != null && (
            <Text style={s.statsStars}>
              <StarDisplay rating={Math.round(averageRating * 2) / 2} />
              <Text style={s.statsAvg}> {averageRating.toFixed(1)} average</Text>
            </Text>
          )}
          {(reviewCount ?? 0) > 0 && (
            <Text style={s.statsCount}>{reviewCount} review{reviewCount !== 1 ? "s" : ""}</Text>
          )}
        </View>
      )}

      {visible.length === 0 ? (
        <Text style={s.empty}>No reviews yet — be the first.</Text>
      ) : (
        visible.map((r) => <ReviewCard key={r.id} review={r} />)
      )}

      {onViewAllPress && visible.length > 0 && (
        <Pressable onPress={onViewAllPress} style={({ pressed }) => [s.viewAll, pressed && { opacity: 0.8 }]}>
          <Text style={s.viewAllText}>{viewAllLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  statsLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statsStars: { flexDirection: "row", alignItems: "center" },
  statsAvg: { fontSize: 14, color: "#a1a1aa" },
  statsCount: { fontSize: 14, color: "#a1a1aa" },
  empty: { color: theme.colors.muted, fontSize: 14, textAlign: "center", paddingVertical: 16 },
  // Card matches web: rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(39,39,42,0.6)",
    backgroundColor: "rgba(24,24,27,0.4)",
    padding: 16,
  },
  cardInner: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  // Avatar: 36px circle (matches web's h-9 w-9)
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", flexShrink: 0, marginTop: 2 },
  avatarFallback: { backgroundColor: "#27272a", alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 14, fontWeight: "700", color: "#d4d4d8" },
  cardBody: { flex: 1, minWidth: 0, gap: 0 },
  // Header: username + stars + date all flex-wrap on one line
  headerRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 2 },
  username: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  stars: { fontSize: 15, color: "#fbbf24", lineHeight: 20 },
  date: { fontSize: 12, color: "#52525b" },
  reviewText: { fontSize: 14, color: "#d4d4d8", lineHeight: 22, marginTop: 8 },
  engagementRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeCount: { fontSize: 12, color: theme.colors.muted },
  viewAll: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    alignItems: "center",
  },
  viewAllText: { color: theme.colors.gold, fontSize: 14, fontWeight: "600" },
});
