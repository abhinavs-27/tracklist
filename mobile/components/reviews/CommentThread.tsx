import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

type CommentWithUser = {
  id: string;
  user_id: string;
  review_id: string;
  content: string;
  created_at: string;
  user?: { id: string; username: string; avatar_url: string | null } | null;
};

type Props = {
  reviewId: string;
  enabled?: boolean;
};

export function CommentThread({ reviewId, enabled = true }: Props) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [fetching, setFetching] = useState(false);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = comments.length;

  async function fetchComments() {
    setFetching(true);
    setError(null);
    try {
      const data = await fetcher<CommentWithUser[]>(
        `/api/comments?review_id=${encodeURIComponent(reviewId)}`,
      );
      setComments(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (open && comments.length === 0 && !fetching) {
      fetchComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reviewId]);

  const canPost = useMemo(
    () => enabled && content.trim().length > 0 && !posting,
    [enabled, content, posting],
  );

  async function submit() {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const created = await fetcher<CommentWithUser>("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: reviewId, content: content.trim() }),
      });
      setComments((prev) => [...prev, created]);
      setContent("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.toggleText}>💬 {count}</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {fetching ? (
            <Text style={styles.muted}>Loading comments...</Text>
          ) : comments.length === 0 ? (
            <Text style={styles.muted}>No comments yet.</Text>
          ) : (
            <View style={styles.list}>
              {comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={styles.username} numberOfLines={1}>
                    {c.user?.username ?? "Unknown"}
                  </Text>
                  <Text style={styles.commentText}>{c.content}</Text>
                </View>
              ))}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          {enabled ? (
            <View style={styles.composer}>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Add a comment..."
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
              />
              <Pressable
                onPress={submit}
                disabled={!canPost}
                style={({ pressed }) => [
                  styles.postBtn,
                  pressed && { opacity: 0.9 },
                  !canPost && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.postBtnText}>{posting ? "…" : "Post"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.muted}>Sign in to comment.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  toggleText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  panel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    gap: 10,
  },
  list: {
    gap: 10,
    maxHeight: 220,
  },
  commentRow: {
    gap: 4,
  },
  username: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  commentText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  composer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: theme.colors.panel,
  },
  postBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.emerald,
    alignItems: "center",
  },
  postBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: "800",
  },
});

