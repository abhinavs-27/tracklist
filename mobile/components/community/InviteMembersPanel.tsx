import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import {
  createCommunityInviteUrl,
  fetchCommunityInviteUrl,
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCommunityInviteUrl(communityId)
      .then((r) => { if (!cancelled) setInviteUrl(r.invite_url); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLinkLoading(false); });
    return () => { cancelled = true; };
  }, [communityId]);

  const handleShareLink = useCallback(async () => {
    let url = inviteUrl;
    if (!url) {
      setLinkLoading(true);
      try {
        const r = await createCommunityInviteUrl(communityId);
        url = r.invite_url;
        setInviteUrl(url);
      } catch {
        setLinkLoading(false);
        return;
      }
      setLinkLoading(false);
    }
    try {
      await Share.share({ url, message: url });
    } catch {
      // user cancelled share sheet
    }
  }, [inviteUrl, communityId]);

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
    const timer = setTimeout(() => { void runSearch(q); }, 300);
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

      {/* Share invite link */}
      <Pressable
        style={[styles.shareBtn, linkLoading && styles.shareBtnDisabled]}
        onPress={handleShareLink}
        disabled={linkLoading}
      >
        {linkLoading ? (
          <ActivityIndicator color={theme.colors.text} size="small" />
        ) : (
          <Text style={styles.shareBtnText}>
            {inviteUrl ? "Share invite link" : "Generate & share link"}
          </Text>
        )}
      </Pressable>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabel}>or invite by username</Text>
        <View style={styles.dividerLine} />
      </View>

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
                <Image source={{ uri: u.avatar_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPh}>
                  <Text style={styles.avatarPhText}>
                    {u.username[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>{u.username}</Text>
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
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.text, marginBottom: 12 },
  shareBtn: {
    backgroundColor: theme.colors.emerald,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnText: { color: "#052e16", fontWeight: "700", fontSize: 14 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  dividerLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: "500" },
  input: {
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
