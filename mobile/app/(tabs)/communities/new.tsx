import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { createCommunity } from "@/lib/api-communities";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

export default function NewCommunityScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    const t = name.trim();
    if (t.length < 2) return;
    setError(null);
    setLoading(true);
    try {
      const { community } = await createCommunity({
        name: t,
        description: description.trim() || null,
        is_private: isPrivate,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.communitiesMine(),
      });
      router.replace(`/communities/${encodeURIComponent(community.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Create community</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Indie heads SF"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What’s this group about?"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, styles.textarea]}
          multiline
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Private (invite-only)</Text>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          trackColor={{ false: theme.colors.border, true: "#065f46" }}
          thumbColor="#fff"
        />
      </View>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Pressable
        style={[styles.submit, name.trim().length < 2 && styles.submitDisabled]}
        onPress={onSubmit}
        disabled={loading || name.trim().length < 2}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Create</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 18 },
  topBar: { marginBottom: 8 },
  back: { color: theme.colors.emerald, fontSize: 16, fontWeight: "600" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 20,
  },
  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.panel,
  },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  err: { color: theme.colors.danger, marginBottom: 12 },
  submit: {
    backgroundColor: theme.colors.emerald,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
