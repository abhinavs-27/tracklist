import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  searchUsersForInvite,
  sendCommunityInvite,
  type SearchUserRow,
} from "@/lib/api-communities";
import { theme } from "@/lib/theme";

export function InviteMembersPanel({ communityId }: { communityId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const rows = await searchUsersForInvite(t);
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, runSearch]);

  async function invite(userId: string) {
    setMessage(null);
    setInviting(userId);
    try {
      await sendCommunityInvite(communityId, userId);
      setMessage("Invite sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not invite");
    } finally {
      setInviting(null);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Invite people</Text>
      <Text style={styles.hint}>
        Search by username (min. 2 characters).
      </Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search users…"
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? (
        <ActivityIndicator color={theme.colors.emerald} style={{ marginTop: 8 }} />
      ) : results.length > 0 ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          {results.map((u) => (
            <View key={u.id} style={styles.row}>
              {u.avatar_url ? (
                <Image source={{ uri: u.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPh}>
                  <Text style={styles.avatarPhText}>
                    {u.username[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {u.username}
              </Text>
              <Pressable
                style={styles.inviteBtn}
                onPress={() => invite(u.id)}
                disabled={inviting === u.id}
              >
                <Text style={styles.inviteBtnText}>
                  {inviting === u.id ? "…" : "Invite"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : q.trim().length >= 2 && !searching ? (
        <Text style={styles.mutedSmall}>No users found.</Text>
      ) : null}
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: theme.colors.panel,
  },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.muted,
    lineHeight: 16,
  },
  input: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPh: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.active,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhText: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.colors.text },
  inviteBtn: {
    backgroundColor: theme.colors.active,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteBtnText: { color: theme.colors.text, fontWeight: "600", fontSize: 13 },
  mutedSmall: { marginTop: 8, fontSize: 12, color: theme.colors.muted },
  msg: { marginTop: 8, fontSize: 12, color: theme.colors.emerald },
});
