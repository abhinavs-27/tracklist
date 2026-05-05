import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";
import type { CommentTarget } from "@/lib/feed-reaction-target";
import { formatRelativeTime } from "@/lib/time";

type CommentUser = { username?: string | null; avatar_url?: string | null } | null;
type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user: CommentUser;
};

type Props = {
  visible: boolean;
  target: CommentTarget;
  onClose: () => void;
  onCountChange?: (n: number) => void;
};

export function CommentSheet({ visible, target, onClose, onCountChange }: Props) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        target_type: target.targetType,
        target_id: target.targetId,
      });
      const data = await fetcher<CommentRow[]>(
        `/api/feed-comments?${params.toString()}`,
      );
      setComments(data ?? []);
      onCountChange?.(data?.length ?? 0);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [visible, target, onCountChange]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setDraft("");
    try {
      const created = await fetcher<CommentRow>("/api/feed-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: target.targetType,
          target_id: target.targetId,
          content: text,
        }),
      });
      if (created) {
        setComments((prev) => [...prev, created]);
        onCountChange?.(comments.length + 1);
      }
    } catch {
      setDraft(text); // restore on failure
    } finally {
      setPosting(false);
    }
  }, [draft, posting, target, comments.length, onCountChange]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={theme.colors.muted} />
          </Pressable>
        </View>

        {/* Comment list */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.emerald} />
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  No comments yet. Be the first.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                {item.user?.avatar_url ? (
                  <Image
                    source={{ uri: item.user.avatar_url }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>
                      {(item.user?.username?.[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentUsername}>
                      {item.user?.username ?? "Someone"}
                    </Text>
                    <Text style={styles.commentTime}>
                      {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{item.content}</Text>
                </View>
              </View>
            )}
          />
        )}

        {/* Input */}
        <View
          style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}
        >
          <TextInput
            ref={inputRef}
            placeholder="Add a comment…"
            placeholderTextColor={theme.colors.muted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={500}
            style={styles.input}
          />
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || posting}
            style={({ pressed }) => [
              styles.sendBtn,
              (!draft.trim() || posting) && styles.sendBtnDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: theme.colors.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    minHeight: "40%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.muted,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    flexGrow: 1,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  commentContent: { flex: 1 },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  commentTime: {
    fontSize: 11,
    color: theme.colors.muted,
  },
  commentText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.active,
  },
});
