import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { fetcher } from "../../lib/api";
import { useLogging } from "../../lib/logging-context";
import { resolveTrackForSearchResult } from "../../lib/resolve-log-target";
import type { LogSource } from "../../lib/types/log";
import { theme } from "../../lib/theme";
import { Artwork } from "../media/Artwork";

type SearchKind = "artist" | "album" | "track";

type SearchResult = {
  key: string;
  kind: SearchKind;
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type SpotifySearchPayload = {
  artists?: {
    items: Array<{
      id: string;
      name: string;
      images?: Array<{ url: string }>;
    }>;
  };
  albums?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      images?: Array<{ url: string }>;
    }>;
  };
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

function flattenSpotifySearch(data: SpotifySearchPayload): SearchResult[] {
  const out: SearchResult[] = [];
  for (const a of data.artists?.items ?? []) {
    out.push({
      key: `artist:${a.id}`,
      kind: "artist",
      id: a.id,
      title: a.name,
      artist: "Artist",
      artworkUrl: a.images?.[0]?.url ?? null,
    });
  }
  for (const al of data.albums?.items ?? []) {
    out.push({
      key: `album:${al.id}`,
      kind: "album",
      id: al.id,
      title: al.name,
      artist: al.artists?.[0]?.name ?? "Album",
      artworkUrl: al.images?.[0]?.url ?? null,
    });
  }
  for (const t of data.tracks?.items ?? []) {
    out.push({
      key: `track:${t.id}`,
      kind: "track",
      id: t.id,
      title: t.name,
      artist: t.artists?.[0]?.name ?? "Track",
      artworkUrl: t.album?.images?.[0]?.url ?? null,
    });
  }
  return out;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Default source for logs from this modal (global FAB uses `manual`). */
  source?: LogSource;
};

export function QuickLogModal({ visible, onClose, source = "manual" }: Props) {
  const { logListen, logBusy, showToast } = useLogging();
  const spotifyOff = !isSpotifyIntegrationEnabled();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const runSearch = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetcher<SpotifySearchPayload>(
        `/api/search?q=${encodeURIComponent(q)}`,
      );
      setResults(flattenSpotifySearch(data));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void runSearch(q);
    }, 320);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setNote("");
      setResolvingKey(null);
    }
  }, [visible]);

  async function onPick(item: SearchResult) {
    if (logBusy) return;
    setResolvingKey(item.key);
    try {
      let resolved;
      try {
        resolved = await resolveTrackForSearchResult(item.kind, item.id);
      } catch {
        showToast("Couldn’t load details. Check your connection.");
        return;
      }
      if (!resolved) {
        showToast("No track found for that item.");
        return;
      }
      try {
        await logListen({
          trackId: resolved.trackId,
          albumId: resolved.albumId ?? null,
          artistId: resolved.artistId ?? null,
          source,
          note: note.trim() || null,
          displayName: resolved.displayNameForLog ?? item.title,
        });
        Keyboard.dismiss();
        onClose();
      } catch {
        showToast("Couldn’t log. Try again.");
      }
    } finally {
      setResolvingKey(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)" }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <View
              style={{
                backgroundColor: theme.colors.bg,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: 28,
                maxHeight: "88%",
                minHeight: 420,
                flex: 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 18,
                  paddingTop: 16,
                  paddingBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: theme.colors.text,
                  }}
                >
                  Log a listen
                </Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Text style={{ color: theme.colors.emerald, fontWeight: "700" }}>
                    Done
                  </Text>
                </Pressable>
              </View>

              <Text
                style={{
                  paddingHorizontal: 18,
                  marginBottom: 10,
                  color: theme.colors.muted,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                Search for a song, album, or artist. Album/artist picks log a representative
                track from that release or artist. Optional note applies to the next pick.
              </Text>

              <View style={{ paddingHorizontal: 18, gap: 10, marginBottom: 12 }}>
                <TextInput
                  placeholder="Artists, albums, tracks…"
                  placeholderTextColor={theme.colors.muted}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.panel,
                    color: theme.colors.text,
                    fontSize: 16,
                  }}
                />
                <TextInput
                  placeholder="Optional note (applies to next log)"
                  placeholderTextColor={theme.colors.muted}
                  value={note}
                  onChangeText={setNote}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.panel,
                    color: theme.colors.text,
                    fontSize: 14,
                  }}
                />
              </View>

              {loading ? (
                <View style={{ paddingVertical: 8, alignItems: "center" }}>
                  <ActivityIndicator color={theme.colors.emerald} />
                </View>
              ) : null}

              <FlatList
                data={results}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: theme.colors.border,
                      marginLeft: 88,
                    }}
                  />
                )}
                ListEmptyComponent={
                  query.trim().length > 0 && !loading ? (
                    <Text
                      style={{
                        paddingHorizontal: 18,
                        color: theme.colors.muted,
                        fontWeight: "600",
                      }}
                    >
                      No results
                    </Text>
                  ) : query.trim().length === 0 ? (
                    <Text
                      style={{
                        paddingHorizontal: 18,
                        color: theme.colors.muted,
                        fontWeight: "600",
                      }}
                    >
                      Type to search Spotify.
                    </Text>
                  ) : null
                }
                renderItem={({ item }) => {
                  const busy = resolvingKey === item.key;
                  return (
                    <Pressable
                      onPress={() => onPick(item)}
                      disabled={!!resolvingKey}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        alignItems: "center",
                        gap: 12,
                        opacity: pressed ? 0.88 : 1,
                      })}
                    >
                      <Artwork src={item.artworkUrl} size="sm" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: theme.colors.text,
                          }}
                        >
                          {item.title}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            color: theme.colors.muted,
                            marginTop: 2,
                          }}
                        >
                          {item.kind === "artist"
                            ? "Artist"
                            : item.kind === "album"
                              ? `Album · ${item.artist}`
                              : `Song · ${item.artist}`}
                        </Text>
                      </View>
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.colors.emerald} />
                      ) : (
                        <Text style={{ color: theme.colors.emerald, fontWeight: "800" }}>
                          Log
                        </Text>
                      )}
                    </Pressable>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
