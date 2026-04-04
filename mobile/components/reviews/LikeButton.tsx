import { Pressable, Text, StyleSheet } from "react-native";
import { useState } from "react";
import { theme } from "@/lib/theme";
import { fetcher } from "@/lib/api";

type Props = {
  reviewId: string;
  enabled?: boolean;
};

export function LikeButton({ reviewId, enabled = true }: Props) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    if (!enabled) return;
    if (isPending) return;
    setIsPending(true);

    const nextLiked = !liked;
    // Optimistic update: we don't have server like counts in the mobile review payload.
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));

    try {
      if (nextLiked) {
        await fetcher("/api/likes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_id: reviewId }),
        });
      } else {
        await fetcher(`/api/likes?review_id=${encodeURIComponent(reviewId)}`, {
          method: "DELETE",
        });
      }
    } catch {
      // Revert optimistic update on failure.
      setLiked(liked);
      setCount((c) => c + (nextLiked ? -1 : 1));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Pressable
      onPress={handleToggle}
      disabled={!enabled || isPending}
      style={({ pressed }) => [
        styles.btn,
        pressed && { opacity: 0.8 },
        !enabled && { opacity: 0.5 },
        isPending && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.heart, liked && styles.heartLiked]}>{liked ? "♥" : "♡"}</Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heart: {
    color: theme.colors.muted,
    fontSize: 16,
    fontWeight: "900",
  },
  heartLiked: {
    color: "#FB7185", // pink-400
  },
  count: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
});

