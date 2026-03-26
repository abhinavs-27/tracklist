import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteList, patchList } from "../../lib/api-lists";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after successful delete (navigate away). */
  onDeleted?: () => void;
  listId: string;
  ownerUserId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialVisibility: string;
};

export function ListEditModal({
  visible,
  onClose,
  onDeleted,
  listId,
  ownerUserId,
  initialTitle,
  initialDescription,
  initialVisibility,
}: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [visibility, setVisibility] = useState<
    "public" | "friends" | "private"
  >(
    initialVisibility === "public" || initialVisibility === "friends"
      ? initialVisibility
      : "private",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(initialTitle);
      setDescription(initialDescription ?? "");
      setVisibility(
        initialVisibility === "public" || initialVisibility === "friends"
          ? initialVisibility
          : "private",
      );
      setError("");
    }
  }, [visible, initialTitle, initialDescription, initialVisibility]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchList(listId, {
        title: title.trim(),
        description: description.trim() || null,
        visibility,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.list(listId) });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userLists(ownerUserId),
      });
      onClose();
    },
    onError: (e: Error) => {
      setError(e.message || "Failed to save");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userLists(ownerUserId),
      });
      onClose();
      onDeleted?.();
    },
    onError: (e: Error) => {
      setError(e.message || "Failed to delete");
    },
  });

  function confirmDelete() {
    Alert.alert(
      "Delete list",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Edit list</Text>
          <Text style={styles.hint}>
            List type (albums vs songs) is set when the list is created on the
            web.
          </Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            placeholderTextColor={theme.colors.muted}
            maxLength={100}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            multiline
            placeholderTextColor={theme.colors.muted}
          />

          <Text style={styles.label}>Visibility</Text>
          {(["public", "friends", "private"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setVisibility(v)}
              style={styles.visRow}
            >
              <View style={[styles.radio, visibility === v && styles.radioOn]} />
              <Text style={styles.visText}>
                {v === "public"
                  ? "Public"
                  : v === "friends"
                    ? "Friends"
                    : "Private"}
              </Text>
            </Pressable>
          ))}

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setError("");
                saveMutation.mutate();
              }}
              disabled={saveMutation.isPending}
              style={styles.btnPrimary}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Save</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            onPress={confirmDelete}
            disabled={deleteMutation.isPending}
            style={styles.danger}
          >
            <Text style={styles.dangerText}>
              {deleteMutation.isPending ? "Deleting…" : "Delete list"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.muted,
    marginBottom: 12,
    lineHeight: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  visRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  radioOn: {
    borderColor: theme.colors.emerald,
    backgroundColor: theme.colors.emerald,
  },
  visText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  err: {
    color: theme.colors.danger,
    marginTop: 8,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  btnGhostText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  btnPrimary: {
    backgroundColor: theme.colors.emerald,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 88,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  danger: {
    marginTop: 20,
    alignItems: "center",
    paddingVertical: 12,
  },
  dangerText: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.danger,
  },
});
