import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fetcher } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { theme } from "../../lib/theme";
import type { LastfmPreviewRow } from "../../../lib/lastfm/types";

type Props = {
  userId: string;
  username: string;
  initialUsername: string | null;
  initialLastSyncedAt?: string | null;
};

function formatLastSynced(iso: string | null | undefined): string {
  if (!iso) return "Not yet";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "Not yet";
  }
}

type PreviewResponse = {
  items: LastfmPreviewRow[];
  matchedCount: number;
  skippedCount: number;
  error?: string | null;
};

type Highlight = {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string | null;
};

type UserListRow = { id: string; title: string; type: "album" | "song" };

function PreviewSkeleton() {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 10,
            paddingVertical: 8,
            opacity: 0.6,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              backgroundColor: theme.colors.border,
            }}
          />
          <View style={{ flex: 1, gap: 6, justifyContent: "center" }}>
            <View
              style={{
                height: 14,
                width: "65%",
                borderRadius: 4,
                backgroundColor: theme.colors.border,
              }}
            />
            <View
              style={{
                height: 11,
                width: "40%",
                borderRadius: 4,
                backgroundColor: theme.colors.border,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function LastfmSection({
  userId,
  username,
  initialUsername,
  initialLastSyncedAt = null,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [usernameInput, setUsernameInput] = useState(initialUsername ?? "");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLastSyncedAt ?? null,
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successImported, setSuccessImported] = useState(0);
  const [successHighlights, setSuccessHighlights] = useState<Highlight[]>([]);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [lists, setLists] = useState<UserListRow[]>([]);
  const [listPickId, setListPickId] = useState<string | null>(null);
  const [listAddBusy, setListAddBusy] = useState(false);
  const [lastImportTrackIds, setLastImportTrackIds] = useState<string[]>([]);

  useEffect(() => {
    setUsernameInput(initialUsername ?? "");
  }, [initialUsername]);

  useEffect(() => {
    setLastSyncedAt(initialLastSyncedAt ?? null);
  }, [initialLastSyncedAt]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = await fetcher<{
        lastfm_username?: string | null;
        lastfm_last_synced_at?: string | null;
      }>("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastfm_username: usernameInput.trim() || "" }),
      });

      let lastSynced: string | null = data.lastfm_last_synced_at ?? null;
      if (typeof data.lastfm_username === "string" && data.lastfm_username.trim()) {
        const syncJson = await fetcher<{
          lastfm_last_synced_at?: string | null;
        }>("/api/lastfm/sync", { method: "POST" });
        if (syncJson.lastfm_last_synced_at) {
          lastSynced = syncJson.lastfm_last_synced_at;
        }
      } else {
        lastSynced = null;
      }

      return {
        lastfm_username: data.lastfm_username ?? null,
        lastfm_last_synced_at: lastSynced,
      };
    },
    onSuccess: (data) => {
      setSavedAt(new Date().toISOString());
      if (data.lastfm_username != null) setUsernameInput(data.lastfm_username);
      setLastSyncedAt(data.lastfm_last_synced_at ?? null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
  });

  const previewQuery = useQuery({
    queryKey: ["lastfm", "preview", usernameInput.trim(), savedAt, previewNonce],
    queryFn: async () => {
      return fetcher<PreviewResponse>("/api/lastfm/preview?limit=200");
    },
    enabled: false,
  });

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const matchedItems = useMemo(
    () => (previewQuery.data?.items ?? []).filter((i) => i.matchStatus === "matched"),
    [previewQuery.data?.items],
  );

  const loadPreview = useCallback(async () => {
    const result = await previewQuery.refetch();
    const items = result.data?.items ?? [];
    const matched = items.filter((i) => i.matchStatus === "matched");
    setSelectedKeys(new Set(matched.map((i) => i.key)));
  }, [previewQuery]);

  const openAddToList = useCallback(async () => {
    setAddToListOpen(true);
    setListPickId(null);
    try {
      const raw = await fetcher<UserListRow[]>(
        `/api/users/${encodeURIComponent(username)}/lists?limit=50`,
      );
      const songLists = Array.isArray(raw) ? raw.filter((l) => l.type === "song") : [];
      setLists(songLists);
      if (songLists[0]) setListPickId(songLists[0].id);
    } catch {
      setLists([]);
    }
  }, [username]);

  const addTracksToList = useCallback(async () => {
    if (!listPickId || lastImportTrackIds.length === 0) return;
    setListAddBusy(true);
    try {
      const unique = [...new Set(lastImportTrackIds)];
      for (const entityId of unique) {
        await fetcher(`/api/lists/${listPickId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "song", entity_id: entityId }),
        });
      }
      setAddToListOpen(false);
      setSuccessOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    } catch (e) {
      console.error(e);
    } finally {
      setListAddBusy(false);
    }
  }, [listPickId, lastImportTrackIds, queryClient, userId]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const items = matchedItems.filter((i) => selectedKeys.has(i.key));
      const entries = items
        .filter((i): i is LastfmPreviewRow & { spotifyTrackId: string } => !!i.spotifyTrackId)
        .map((i) => ({
          spotifyTrackId: i.spotifyTrackId,
          listenedAt: i.listenedAtIso,
          albumId: i.albumId,
          artistId: i.artistId,
          trackName: i.trackName,
          artistName: i.artistName,
          artworkUrl: i.artworkUrl,
        }));
      if (entries.length === 0) throw new Error("Select at least one matched track");
      const data = await fetcher<{
        imported: number;
        message?: string;
        highlights?: Highlight[];
      }>("/api/lastfm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      return { ...data, _entries: entries };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      setPreviewNonce((n) => n + 1);
      void queryClient.removeQueries({ queryKey: ["lastfm", "preview"] });
      setLastImportTrackIds([...new Set(data._entries.map((e) => e.spotifyTrackId))]);
      setSuccessImported(data.imported);
      setSuccessHighlights(data.highlights ?? []);
      setSuccessOpen(true);
    },
  });

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const preview = previewQuery.data;
  const showList = previewQuery.data && !previewQuery.isFetching;

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panel,
        padding: 14,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text }}>
        Last.fm
      </Text>
      <Text style={{ fontSize: 13, color: theme.colors.muted, lineHeight: 18 }}>
        Save your Last.fm username once. New scrobbles sync automatically (including right after you
        save). No password — we only use Last.fm’s public API.
      </Text>
      {usernameInput.trim() ? (
        <Text style={{ fontSize: 12, color: theme.colors.muted }}>
          Last automatic sync:{" "}
          <Text style={{ color: theme.colors.text }}>{formatLastSynced(lastSyncedAt)}</Text>
        </Text>
      ) : null}
      <TextInput
        value={usernameInput}
        onChangeText={setUsernameInput}
        placeholder="Last.fm username"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: theme.colors.text,
          backgroundColor: theme.colors.bg,
        }}
      />
      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          backgroundColor: theme.colors.border,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 10,
          opacity: pressed || saveMutation.isPending ? 0.8 : 1,
        })}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color={theme.colors.text} />
        ) : (
          <Text style={{ fontWeight: "700", color: theme.colors.text }}>Save & sync</Text>
        )}
      </Pressable>
      {saveMutation.isError && (
        <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
          {saveMutation.error instanceof Error ? saveMutation.error.message : "Save failed"}
        </Text>
      )}

      <Pressable
        onPress={() => setManualOpen((o) => !o)}
        style={({ pressed }) => ({
          paddingVertical: 8,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.emerald }}>
          {manualOpen ? "▼" : "▶"} Manual preview & import (optional)
        </Text>
      </Pressable>

      {manualOpen ? (
        <>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => void loadPreview()}
              disabled={!usernameInput.trim() || previewQuery.isFetching}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed || !usernameInput.trim() ? 0.6 : 1,
              })}
            >
              {previewQuery.isFetching ? (
                <ActivityIndicator size="small" color={theme.colors.emerald} />
              ) : (
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>Load preview</Text>
              )}
            </Pressable>
            {matchedItems.length > 0 && !previewQuery.isFetching ? (
              <>
                <Pressable
                  onPress={() => setSelectedKeys(new Set(matchedItems.map((i) => i.key)))}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: theme.colors.muted }}>Select all matched</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedKeys(new Set())}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ fontWeight: "700", color: theme.colors.muted }}>Deselect all</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {previewQuery.isError && (
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              {previewQuery.error instanceof Error ? previewQuery.error.message : "Preview failed"}
            </Text>
          )}

          {previewQuery.isFetching ? <PreviewSkeleton /> : null}

          {showList && preview ? (
            <>
              {preview.error ? (
                <Text style={{ color: "#fbbf24", fontSize: 13 }}>{preview.error}</Text>
              ) : (
                <Text style={{ fontSize: 13, color: theme.colors.muted }}>
                  <Text style={{ fontWeight: "700", color: theme.colors.emerald }}>
                    {preview.matchedCount} matched
                  </Text>
                  {" · "}
                  <Text>{preview.skippedCount} skipped</Text>
                </Text>
              )}
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                {preview.items.map((row) => {
                  const matched = row.matchStatus === "matched";
                  const checked = selectedKeys.has(row.key);
                  return (
                    <Pressable
                      key={row.key}
                      onPress={() => matched && toggleKey(row.key)}
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <Text style={{ width: 20, color: theme.colors.muted }}>
                        {matched ? (checked ? "☑" : "☐") : "—"}
                      </Text>
                      {row.artworkUrl ? (
                        <Image source={{ uri: row.artworkUrl }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 6,
                            backgroundColor: theme.colors.bg,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: theme.colors.muted }}>♪</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontWeight: "700", color: theme.colors.text }} numberOfLines={1}>
                          {row.trackName}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.muted }} numberOfLines={1}>
                          {row.artistName}
                        </Text>
                        {!matched ? (
                          <Text style={{ fontSize: 11, color: "#fbbf24" }}>No Spotify match</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          {matchedItems.length > 0 && !previewQuery.isFetching ? (
            <Pressable
              onPress={() => importMutation.mutate()}
              disabled={importMutation.isPending || selectedKeys.size === 0}
              style={{
                backgroundColor: theme.colors.emerald,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                opacity: importMutation.isPending || selectedKeys.size === 0 ? 0.5 : 1,
              }}
            >
              {importMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontWeight: "800", color: "#fff" }}>
                  Import selected ({selectedKeys.size})
                </Text>
              )}
            </Pressable>
          ) : null}
          {importMutation.isError && (
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              {importMutation.error instanceof Error ? importMutation.error.message : "Import failed"}
            </Text>
          )}
        </>
      ) : null}

      <Modal visible={successOpen} transparent animationType="fade">
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
            padding: 16,
          }}
          onPress={() => setSuccessOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.panel,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text }}>
              Imported {successImported} listens from Last.fm
            </Text>
            {successHighlights.slice(0, 3).map((h) => (
              <View key={h.spotifyTrackId} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                {h.artworkUrl ? (
                  <Image source={{ uri: h.artworkUrl }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                ) : (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      backgroundColor: theme.colors.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: theme.colors.muted }}>♪</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "700", color: theme.colors.text }} numberOfLines={1}>
                    {h.trackName}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.muted }} numberOfLines={1}>
                    {h.artistName}
                  </Text>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <Pressable
                onPress={() => {
                  setSuccessOpen(false);
                  router.push("/(tabs)");
                }}
                style={{
                  backgroundColor: theme.colors.emerald,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#fff" }}>View your logs</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSuccessOpen(false);
                  void openAddToList();
                }}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>Add to list</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={addToListOpen} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.panel,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.text }}>
              Add to a song list
            </Text>
            {lists.length === 0 ? (
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                Create a song list from your profile first.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 200 }}>
                {lists.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setListPickId(l.id)}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      backgroundColor: listPickId === l.id ? theme.colors.bg : "transparent",
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: listPickId === l.id ? "800" : "500" }}>
                      {l.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <Pressable onPress={() => setAddToListOpen(false)}>
                <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={listAddBusy || !listPickId || lists.length === 0}
                onPress={() => void addTracksToList()}
                style={{ opacity: listAddBusy || !listPickId ? 0.5 : 1 }}
              >
                <Text style={{ color: theme.colors.emerald, fontWeight: "800" }}>
                  {listAddBusy ? "Adding…" : "Add tracks"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
