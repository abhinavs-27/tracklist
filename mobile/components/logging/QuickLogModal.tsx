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
import type { LogSource } from "../../lib/types/log";
import { theme } from "../../lib/theme";
import { Artwork } from "../media/Artwork";

type TrackSearchResult = {
  key: string;
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type SpotifySearchPayload = {
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      artists?: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

function flattenTrackSearch(data: SpotifySearchPayload): TrackSearchResult[] {
  return (data.tracks?.items ?? []).map((t) => ({
    key: `track:${t.id}`,
    id: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name ?? "Unknown artist",
    artworkUrl: t.album?.images?.[0]?.url ?? null,
  }));
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Default source for logs from this modal (global FAB uses `manual`). */
  source?: LogSource;
};

export function QuickLogModal({ visible, onClose, source = "manual" }: Props) {
  const { logListen, logBusy, showToast } = useLogging();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackSearchResult[]>([]);
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
      const params = new URLSearchParams({ q, type: "track" });
      const data = await fetcher<SpotifySearchPayload>(
        `/api/search?${params.toString()}`,
      );
      setResults(flattenTrackSearch(data));
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

  async function onPick(item: TrackSearchResult) {
    if (logBusy) return;
    setResolvingKey(item.key);
    try {
      const displayName = `${item.title} · ${item.artist}`;
      try {
        await logListen({
          trackId: item.id,
          albumId: null,
          artistId: null,
          source,
          note: note.trim() || null,
          displayName,
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
                Search for a track, tap to log. Optional note applies to the next pick.
              </Text>

              <View style={{ paddingHorizontal: 18, gap: 10, marginBottom: 12 }}>
                <TextInput
                  placeholder="Search tracks…"
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
                      Type to search for tracks.
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
                          Song · {item.artist}
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
