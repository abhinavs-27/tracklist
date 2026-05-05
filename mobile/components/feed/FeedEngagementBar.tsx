import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { useItemReaction } from "@/lib/hooks/useItemReaction";
import { CommentSheet } from "./CommentSheet";
import type { ReactionTarget, CommentTarget } from "@/lib/feed-reaction-target";

type Props = {
  reactionTarget: ReactionTarget;
  commentTarget: CommentTarget | null;
  initialCommentCount?: number;
};

export function FeedEngagementBar({
  reactionTarget,
  commentTarget,
  initialCommentCount = 0,
}: Props) {
  const { liked, count, toggle, loading } = useItemReaction(reactionTarget);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);

  return (
    <>
      <View style={styles.row}>
        {/* Like button */}
        <Pressable
          onPress={toggle}
          disabled={loading}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike" : "Like"}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={19}
            color={liked ? "#FB7185" : theme.colors.muted}
          />
          {count > 0 && (
            <Text style={[styles.btnCount, liked && styles.btnCountLiked]}>
              {count}
            </Text>
          )}
        </Pressable>

        {/* Comment button — only shown when commenting is supported for this item type */}
        {commentTarget && (
          <Pressable
            onPress={() => setCommentOpen(true)}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Comments"
          >
            <Ionicons
              name={commentOpen ? "chatbubble" : "chatbubble-outline"}
              size={17}
              color={commentOpen ? theme.colors.emerald : theme.colors.muted}
            />
            {commentCount > 0 && (
              <Text style={[styles.btnCount, commentOpen && styles.btnCountActive]}>
                {commentCount}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {commentTarget && (
        <CommentSheet
          visible={commentOpen}
          target={commentTarget}
          onClose={() => setCommentOpen(false)}
          onCountChange={setCommentCount}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 10,
    paddingHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    marginTop: 10,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  btnCount: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  btnCountLiked: {
    color: "#FB7185",
  },
  btnCountActive: {
    color: theme.colors.emerald,
  },
});
