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
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { theme } from "@/lib/theme";

export function DeleteAccountSection({ username }: { username: string }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setLoading(true);
    try {
      await fetcher("/api/users/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmUsername: confirmUsername.trim(),
          acknowledgePermanent: acknowledge,
        }),
      });
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete account");
    } finally {
      setLoading(false);
    }
  }

  const canDelete =
    !loading &&
    acknowledge &&
    confirmUsername.trim().toLowerCase() === username.toLowerCase();

  return (
    <View style={s.card}>
      <Text style={s.heading}>Delete account</Text>
      <Text style={s.desc}>
        This permanently deletes your Tracklist account and{" "}
        <Text style={s.descBold}>all data tied to it</Text>, including listening history,
        logs, reviews, lists, followers, and community memberships.
      </Text>
      <Text style={s.warning}>This cannot be undone.</Text>

      {!open ? (
        <Pressable
          style={({ pressed }) => [s.openBtn, pressed && { opacity: 0.75 }]}
          onPress={() => { setOpen(true); setError(null); setConfirmUsername(""); setAcknowledge(false); }}
        >
          <Text style={s.openBtnText}>I want to delete my account…</Text>
        </Pressable>
      ) : (
        <View style={s.confirm}>
          {/* Acknowledge checkbox row */}
          <Pressable style={s.checkRow} onPress={() => setAcknowledge((v) => !v)}>
            <View style={[s.checkbox, acknowledge && s.checkboxChecked]}>
              {acknowledge ? <Text style={s.checkmark}>✓</Text> : null}
            </View>
            <Text style={s.checkLabel}>
              I understand that all of my data will be permanently deleted and this cannot be reversed.
            </Text>
          </Pressable>

          {/* Username confirmation */}
          <View style={s.field}>
            <Text style={s.fieldLabel}>
              Type your username{" "}
              <Text style={{ color: "#fca5a5" }}>{username}</Text>{" "}
              to confirm
            </Text>
            <TextInput
              value={confirmUsername}
              onChangeText={setConfirmUsername}
              placeholder={username}
              placeholderTextColor={theme.colors.muted}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.btnRow}>
            <Pressable
              style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.75 }]}
              onPress={() => { setOpen(false); setError(null); }}
              disabled={loading}
            >
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.deleteBtn, !canDelete && s.deleteBtnDisabled, pressed && canDelete && { opacity: 0.8 }]}
              onPress={() => void handleDelete()}
              disabled={!canDelete}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.deleteBtnText}>Delete forever</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(153,27,27,0.4)",
    backgroundColor: "rgba(69,10,10,0.15)",
    padding: 18,
  },
  heading: { fontSize: 17, fontWeight: "600", color: "#fecaca", letterSpacing: -0.2 },
  desc: { fontSize: 13, color: "#a1a1aa", lineHeight: 19, marginTop: 8 },
  descBold: { fontWeight: "600", color: "#d4d4d8" },
  warning: { fontSize: 13, fontWeight: "600", color: "#fca5a5", marginTop: 8 },
  openBtn: {
    marginTop: 14, alignSelf: "flex-start",
    borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(153,27,27,0.6)", backgroundColor: "rgba(127,29,29,0.4)",
    paddingHorizontal: 14, paddingVertical: 9,
  },
  openBtnText: { fontSize: 13, fontWeight: "600", color: "#fca5a5" },
  confirm: { marginTop: 16, gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(153,27,27,0.3)", paddingTop: 16 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
    borderColor: "#71717a", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: "#ef4444", borderColor: "#ef4444" },
  checkmark: { fontSize: 12, fontWeight: "700", color: "#fff" },
  checkLabel: { flex: 1, fontSize: 13, color: "#d4d4d8", lineHeight: 19 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "500", color: "#d4d4d8" },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#3f3f46",
    borderRadius: 10, padding: 11, fontSize: 15,
    color: theme.colors.text, backgroundColor: "rgba(24,24,27,0.8)",
  },
  error: { fontSize: 13, color: "#f87171" },
  btnRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    borderRadius: 10, borderWidth: 1, borderColor: "#3f3f46",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  cancelText: { fontSize: 13, fontWeight: "600", color: "#d4d4d8" },
  deleteBtn: {
    flex: 1, borderRadius: 10, backgroundColor: "#dc2626",
    paddingHorizontal: 16, paddingVertical: 10, alignItems: "center",
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
});
