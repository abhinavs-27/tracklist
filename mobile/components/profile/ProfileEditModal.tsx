import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetcher } from "@/lib/api";
import { theme } from "@/lib/theme";

type FavoriteAlbum = { album_id: string; name: string; image_url: string | null };
type SearchAlbum = { id: string; name: string; artists: { name: string }[]; images: { url: string }[] };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (updates: { username: string; bio: string | null }) => void;
  initialUsername: string;
  initialBio: string | null;
};

export function ProfileEditModal({ visible, onClose, onSaved, initialUsername, initialBio }: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(initialBio ?? "");
  const [favorites, setFavorites] = useState<FavoriteAlbum[]>([]);
  const [loadingFav, setLoadingFav] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchAlbum[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load favorites when modal opens
  useEffect(() => {
    if (!visible) return;
    setLoadingFav(true);
    fetcher<{ albums: FavoriteAlbum[] }>("/api/users/me/favorites")
      .then((r) => setFavorites(r.albums ?? []))
      .catch(() => {})
      .finally(() => setLoadingFav(false));
  }, [visible]);

  // Debounced album search
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetcher<{ albums?: { items: SearchAlbum[] } }>(
          `/api/search?q=${encodeURIComponent(q)}&type=album`
        );
        setSearchResults(data.albums?.items?.slice(0, 8) ?? []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQ]);

  function addAlbum(a: SearchAlbum) {
    if (favorites.length >= 4) return;
    if (favorites.some((f) => f.album_id === a.id)) return;
    setFavorites((prev) => [...prev, {
      album_id: a.id,
      name: a.name,
      image_url: a.images[0]?.url ?? null,
    }]);
    setSearchQ("");
    setSearchResults([]);
  }

  function removeAlbum(albumId: string) {
    setFavorites((prev) => prev.filter((f) => f.album_id !== albumId));
  }

  async function onSave() {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2) { setError("Username must be at least 2 characters."); return; }
    setError(null);
    setSaving(true);
    try {
      await fetcher("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, bio: bio.trim() || null }),
      });
      await fetcher("/api/users/me/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albums: favorites.map((f) => f.album_id) }),
      });
      onSaved({ username: trimmedUsername, bio: bio.trim() || null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={s.safe} edges={["top"]}>
          {/* Header */}
          <View style={s.header}>
            <Pressable onPress={() => !saving && onClose()}>
              <Text style={s.cancel}>Cancel</Text>
            </Pressable>
            <Text style={s.title}>Edit profile</Text>
            <Pressable onPress={onSave} disabled={saving || username.trim().length < 2}>
              <Text style={[s.save, (saving || username.trim().length < 2) && s.saveDisabled]}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>

          <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
            {/* Username */}
            <View style={s.field}>
              <Text style={s.label}>Username</Text>
              <TextInput value={username} onChangeText={setUsername} placeholder="username"
                placeholderTextColor={theme.colors.muted} style={s.input}
                autoCapitalize="none" autoCorrect={false} />
            </View>

            {/* Bio */}
            <View style={s.field}>
              <Text style={s.label}>Bio</Text>
              <TextInput value={bio} onChangeText={setBio} placeholder="Tell people about your taste…"
                placeholderTextColor={theme.colors.muted} style={[s.input, s.textarea]}
                multiline textAlignVertical="top" />
            </View>

            {/* Favorite albums */}
            <View style={s.field}>
              <Text style={s.label}>Favorite albums ({favorites.length}/4)</Text>

              {/* Current selection */}
              {loadingFav ? (
                <ActivityIndicator color={theme.colors.emerald} style={{ marginVertical: 8 }} />
              ) : (
                <View style={s.favRow}>
                  {favorites.map((f) => (
                    <View key={f.album_id} style={s.favItem}>
                      <Pressable onPress={() => removeAlbum(f.album_id)} style={s.favRemove}>
                        <Text style={s.favRemoveText}>×</Text>
                      </Pressable>
                      {f.image_url ? (
                        <Image source={{ uri: f.image_url }} style={s.favArt} contentFit="cover" />
                      ) : (
                        <View style={[s.favArt, s.favArtPh]}><Text style={{ color: theme.colors.muted }}>♪</Text></View>
                      )}
                      <Text style={s.favName} numberOfLines={2}>{f.name}</Text>
                    </View>
                  ))}
                  {favorites.length < 4 && Array.from({ length: 4 - favorites.length }).map((_, i) => (
                    <View key={`empty-${i}`} style={[s.favItem, { opacity: 0.3 }]}>
                      <View style={[s.favArt, s.favArtPh]}><Text style={{ color: theme.colors.muted, fontSize: 22 }}>+</Text></View>
                    </View>
                  ))}
                </View>
              )}

              {/* Search */}
              {favorites.length < 4 && (
                <>
                  <TextInput
                    value={searchQ}
                    onChangeText={setSearchQ}
                    placeholder="Search albums to add…"
                    placeholderTextColor={theme.colors.muted}
                    style={[s.input, { marginTop: 10 }]}
                  />
                  {searching && <ActivityIndicator color={theme.colors.emerald} style={{ marginTop: 8 }} />}
                  {searchResults.map((a) => (
                    <Pressable
                      key={a.id}
                      style={({ pressed }) => [s.searchRow, pressed && { opacity: 0.7 }]}
                      onPress={() => addAlbum(a)}
                    >
                      {a.images[0]?.url ? (
                        <Image source={{ uri: a.images[0].url }} style={s.searchArt} contentFit="cover" />
                      ) : (
                        <View style={[s.searchArt, s.favArtPh]} />
                      )}
                      <View style={s.searchMeta}>
                        <Text style={s.searchName} numberOfLines={1}>{a.name}</Text>
                        <Text style={s.searchArtist} numberOfLines={1}>{a.artists.map(x => x.name).join(", ")}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  cancel: { fontSize: 16, color: theme.colors.muted },
  title: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  save: { fontSize: 16, fontWeight: "700", color: theme.colors.emerald },
  saveDisabled: { opacity: 0.4 },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  field: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border,
    borderRadius: 12, padding: 13, fontSize: 16,
    color: theme.colors.text, backgroundColor: theme.colors.panel,
  },
  textarea: { minHeight: 88, textAlignVertical: "top" },

  /* Favorites */
  favRow: { flexDirection: "row", gap: 10 },
  favItem: { flex: 1, alignItems: "center", gap: 6, position: "relative" },
  favArt: { width: "100%", aspectRatio: 1, borderRadius: 8 },
  favArtPh: { backgroundColor: theme.colors.panel, alignItems: "center", justifyContent: "center" },
  favName: { fontSize: 10, color: theme.colors.muted, textAlign: "center" },
  favRemove: {
    position: "absolute", top: -6, right: -6, zIndex: 10,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
  },
  favRemoveText: { fontSize: 14, fontWeight: "700", color: "#fff", lineHeight: 16 },

  /* Search results */
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  searchArt: { width: 44, height: 44, borderRadius: 6 },
  searchMeta: { flex: 1, minWidth: 0 },
  searchName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  searchArtist: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },

  error: { color: theme.colors.danger, fontSize: 14, marginBottom: 12 },
});
