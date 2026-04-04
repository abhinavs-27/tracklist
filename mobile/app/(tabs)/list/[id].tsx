import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Artwork } from "@/components/media/Artwork";
import { ListEditModal } from "@/components/list/ListEditModal";
import { addListItem, removeListItem } from "@/lib/api-lists";
import { fetcher } from "@/lib/api";
import { useListDetail } from "@/lib/hooks/useListDetail";
import { useProfile } from "@/lib/hooks/useProfile";
import type { ListItemEnriched } from "@/lib/types/list-detail";
import { queryKeys } from "@/lib/query-keys";
import { theme } from "@/lib/theme";

type SpotifySearchPayload = {
  albums?: {
    items: Array<{
      id: string;
      name: string;
      images?: Array<{ url: string }>;
    }>;
  };
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

type SearchPick = { id: string; name: string; artworkUrl: string | null };

function itemTitle(it: ListItemEnriched): string {
  if (it.entity_type === "album") {
    return it.album?.name?.trim() || "Album";
  }
  return it.track?.name?.trim() || "Track";
}

function itemSubtitle(it: ListItemEnriched): string {
  if (it.entity_type === "album") {
    return it.album?.artists?.map((a) => a.name).join(", ") ?? "";
  }
  return it.track?.artists?.map((a) => a.name).join(", ") ?? "";
}

function itemArtwork(it: ListItemEnriched): string | null {
  if (it.entity_type === "album") {
    return it.album?.images?.[0]?.url ?? null;
  }
  return it.track?.album?.images?.[0]?.url ?? null;
}

export default function ListDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: meProfile } = useProfile();

  const listId = useMemo(() => {
    if (!id) return "";
    return Array.isArray(id) ? id[0] : id;
  }, [id]);

  const { data, isPending, error, refetch } = useListDetail(
    listId.trim() || undefined,
  );

  const [editOpen, setEditOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchPick[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const list = data?.list;
  const items = data?.items ?? [];
  const ownerUsername = data?.owner_username;

  const isOwner =
    !!meProfile?.id && !!list?.user_id && meProfile.id === list.user_id;

  const searchAdds = useCallback(
    async (q: string, entityType: "album" | "song") => {
      const t = q.trim();
      if (!t) {
        setAddResults([]);
        return;
      }
      setAddSearching(true);
      try {
        const typeParam = entityType === "album" ? "album" : "track";
        const payload = await fetcher<SpotifySearchPayload>(
          `/api/search?q=${encodeURIComponent(t)}&type=${typeParam}&limit=12`,
        );
        const out: SearchPick[] = [];
        if (entityType === "album") {
          for (const al of payload.albums?.items ?? []) {
            out.push({
              id: al.id,
              name: al.name,
              artworkUrl: al.images?.[0]?.url ?? null,
            });
          }
        } else {
          for (const tr of payload.tracks?.items ?? []) {
            out.push({
              id: tr.id,
              name: tr.name,
              artworkUrl: tr.album?.images?.[0]?.url ?? null,
            });
          }
        }
        setAddResults(out);
      } catch {
        setAddResults([]);
      } finally {
        setAddSearching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isOwner || !list) return;
    const t = setTimeout(() => {
      if (addQuery.trim()) void searchAdds(addQuery, list.type);
    }, 320);
    return () => clearTimeout(t);
  }, [addQuery, isOwner, list, searchAdds]);

  const addMutation = useMutation({
    mutationFn: (entityId: string) =>
      addListItem(listId, list!.type, entityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.list(listId) });
      setAddQuery("");
      setAddResults([]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeListItem(listId, itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.list(listId) });
    },
  });

  if (!listId.trim()) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={styles.muted}>Missing list</Text>
      </SafeAreaView>
    );
  }

  if (isPending && !data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.emerald} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data || !list) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn&apos;t load this list</Text>
          <Text style={styles.errorDetail} selectable>
            {error instanceof Error ? error.message : String(error ?? "")}
          </Text>
          <Text style={styles.retry} onPress={() => refetch()}>
            Tap to retry
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.back}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>
                {list.title}
              </Text>
              {isOwner ? (
                <Pressable
                  onPress={() => setEditOpen(true)}
                  style={({ pressed }) => [
                    styles.editBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            {ownerUsername ? (
              <Text style={styles.owner}>by {ownerUsername}</Text>
            ) : null}
            <Text style={styles.typeLine}>
              {list.type === "album" ? "Album" : "Song"} list ·{" "}
              {list.visibility}
            </Text>
            {list.description ? (
              <Text style={styles.desc}>{list.description}</Text>
            ) : null}
          </View>

          {isOwner ? (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add {list.type === "album" ? "albums" : "songs"}</Text>
              <TextInput
                value={addQuery}
                onChangeText={setAddQuery}
                placeholder={
                  list.type === "album"
                    ? "Search albums…"
                    : "Search tracks…"
                }
                placeholderTextColor={theme.colors.muted}
                style={styles.addInput}
              />
              {addSearching ? (
                <ActivityIndicator color={theme.colors.emerald} />
              ) : (
                <FlatList
                  data={addResults}
                  keyExtractor={(i) => i.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        if (addMutation.isPending) return;
                        addMutation.mutate(item.id);
                      }}
                      style={({ pressed }) => [
                        styles.addRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Artwork src={item.artworkUrl} size="sm" />
                      <Text style={styles.addRowTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.addHint}>Add</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Items ({items.length})</Text>
          {items.map((it) => (
            <View key={it.id} style={styles.row}>
              <Pressable
                onPress={() => {
                  if (it.entity_type === "album") {
                    router.push(`/album/${it.entity_id}`);
                  } else {
                    router.push(`/song/${it.entity_id}`);
                  }
                }}
                style={({ pressed }) => [
                  styles.rowMain,
                  pressed && styles.pressed,
                ]}
              >
                <Artwork src={itemArtwork(it)} size="sm" />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {itemTitle(it)}
                  </Text>
                  {itemSubtitle(it) ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {itemSubtitle(it)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {isOwner ? (
                <Pressable
                  onPress={() => {
                    if (removeMutation.isPending) return;
                    removeMutation.mutate(it.id);
                  }}
                  style={styles.removeBtn}
                  hitSlop={12}
                >
                  <Text style={styles.removeGlyph}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {items.length === 0 ? (
            <Text style={styles.empty}>No items in this list yet.</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ListEditModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        onDeleted={() => router.back()}
        listId={listId}
        ownerUserId={list.user_id}
        initialTitle={list.title}
        initialDescription={list.description}
        initialVisibility={list.visibility}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  owner: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  typeLine: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
    textTransform: "capitalize",
  },
  desc: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.muted,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  addSection: {
    paddingHorizontal: 16,
    gap: 8,
  },
  addInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  addRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  addHint: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.emerald,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelSoft,
    overflow: "hidden",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.88,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },
  rowSub: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  removeGlyph: {
    fontSize: 18,
    color: theme.colors.muted,
    fontWeight: "700",
  },
  empty: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  muted: {
    padding: 24,
    color: theme.colors.muted,
    fontWeight: "600",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  errorDetail: {
    fontSize: 12,
    color: theme.colors.muted,
    textAlign: "center",
  },
  retry: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.emerald,
  },
});
