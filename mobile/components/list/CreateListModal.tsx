import { useCallback, useEffect, useRef, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { createList } from "@/lib/api-lists";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";
import { Artwork } from "@/components/media/Artwork";

type SpotifySearchPayload = {
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

type Picked = { id: string; name: string; artworkUrl: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CreateListModal({ visible, onClose }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { height: windowHeight } = useWindowDimensions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listType, setListType] = useState<"album" | "song">("album");
  const [visibility, setVisibility] = useState<
    "public" | "friends" | "private"
  >("private");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Picked[]>([]);
  const [selected, setSelected] = useState<Picked[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const selectedRef = useRef<Picked[]>([]);
  selectedRef.current = selected;

  const search = useCallback(
    async (q: string) => {
      const t = q.trim();
      if (!t) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const typeParam = listType === "album" ? "album" : "track";
        const data = await fetcher<SpotifySearchPayload>(
          `/api/search?q=${encodeURIComponent(t)}&type=${typeParam}&limit=12`,
        );
        const out: Picked[] = [];
        if (listType === "album") {
          for (const al of data.albums?.items ?? []) {
            out.push({
              id: al.id,
              name: al.name,
              artworkUrl: al.images?.[0]?.url ?? null,
            });
          }
        } else {
          for (const tr of data.tracks?.items ?? []) {
            out.push({
              id: tr.id,
              name: tr.name,
              artworkUrl: tr.album?.images?.[0]?.url ?? null,
            });
          }
        }
        setSearchResults(out);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [listType],
  );

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (query.trim()) void search(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, search, visible]);

  useEffect(() => {
    if (!visible) {
      setTitle("");
      setDescription("");
      setListType("album");
      setVisibility("private");
      setQuery("");
      setSearchResults([]);
      setSelected([]);
      setError("");
    }
  }, [visible]);

  const onPickPress = useCallback((p: Picked) => {
    const has = selectedRef.current.some((x) => x.id === p.id);
    if (has) {
      setSelected((prev) => prev.filter((x) => x.id !== p.id));
      return;
    }
    setSelected((prev) => [...prev, p]);
    setQuery("");
    setSearchResults([]);
  }, []);

  const removeFromSelected = useCallback((id: string) => {
    setSelected((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const createMutation = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) throw new Error("Title is required");
      return createList({
        title: t,
        description: description.trim() || null,
        type: listType,
        visibility,
        initial_items:
          selected.length > 0
            ? selected.map((s) => ({
                entity_type: listType,
                entity_id: s.id,
              }))
            : undefined,
      });
    },
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userLists(list.user_id) });
      onClose();
      router.push(`/list/${list.id}`);
    },
    onError: (e: Error) => {
      setError(e.message || "Failed to create list");
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: windowHeight * 0.88 }}
            contentContainerStyle={styles.sheetScrollContent}
          >
          <Text style={styles.sheetTitle}>Create new list</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="My favorites"
            placeholderTextColor={theme.colors.muted}
            maxLength={100}
            style={styles.input}
          />
          <Text style={styles.counter}>{title.length}/100</Text>

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A few words…"
            placeholderTextColor={theme.colors.muted}
            multiline
            style={[styles.input, styles.textarea]}
          />

          <Text style={styles.label}>List type</Text>
          <View style={styles.row}>
            {(["album", "song"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setListType(t);
                  setSelected([]);
                  setSearchResults([]);
                  setQuery("");
                }}
                style={[
                  styles.chip,
                  listType === t && styles.chipOn,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    listType === t && styles.chipTextOn,
                  ]}
                >
                  {t === "album" ? "Albums" : "Songs"}
                </Text>
              </Pressable>
            ))}
          </View>

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

          <Text style={styles.label}>Add items (optional)</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              listType === "album" ? "Search albums…" : "Search tracks…"
            }
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
          />
          {searching ? (
            <ActivityIndicator color={theme.colors.emerald} />
          ) : searchResults.length > 0 ? (
            <View style={styles.searchList}>
              {searchResults.map((item) => {
                const on = selected.some((s) => s.id === item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onPickPress(item)}
                    style={[styles.searchRow, on && styles.searchRowOn]}
                  >
                    <Artwork src={item.artworkUrl} size="sm" />
                    <View style={styles.searchTitleCol}>
                      <Text style={styles.searchTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {on ? (
                        <View style={styles.addedBadge}>
                          <Text style={styles.addedBadgeText}>Added</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.check}>{on ? "✓" : ""}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selected.length > 0 ? (
            <View style={styles.addedPanel}>
              <Text style={styles.addedPanelLabel}>
                Added to list ({selected.length})
              </Text>
              <View style={styles.addedRows}>
                {selected.map((item, index) => (
                  <View key={item.id} style={styles.addedRow}>
                    <Text style={styles.addedIndex}>{index + 1}</Text>
                    <Artwork src={item.artworkUrl} size="sm" />
                    <Text style={styles.addedName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Pressable
                      onPress={() => removeFromSelected(item.id)}
                      hitSlop={8}
                      style={styles.addedRemove}
                      accessibilityRole="button"
                      accessibilityLabel="Remove from list"
                    >
                      <Text style={styles.addedRemoveText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setError("");
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
              style={styles.btnPrimary}
            >
              <Text style={styles.btnPrimaryText}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
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
    maxHeight: "92%",
  },
  sheetScrollContent: {
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 12,
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
    minHeight: 64,
    textAlignVertical: "top",
  },
  counter: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipOn: {
    borderColor: theme.colors.emerald,
    backgroundColor: theme.colors.panel,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.muted,
  },
  chipTextOn: {
    color: theme.colors.emerald,
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
  searchList: {
    maxHeight: 200,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    overflow: "hidden",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  searchRowOn: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  searchTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  searchTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  addedBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  addedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.emerald,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  addedPanel: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    padding: 10,
  },
  addedPanelLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addedRows: {
    gap: 6,
  },
  addedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.bg,
  },
  addedIndex: {
    width: 20,
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.muted,
    textAlign: "right",
  },
  addedName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  addedRemove: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  addedRemoveText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "500",
    color: theme.colors.muted,
  },
  check: {
    fontSize: 16,
    color: theme.colors.emerald,
    fontWeight: "800",
  },
  err: {
    color: theme.colors.danger,
    fontSize: 13,
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
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
