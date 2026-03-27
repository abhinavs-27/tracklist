"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { queryKeys } from "@/lib/query-keys";
import type { LastfmPreviewRow } from "@/lib/lastfm/types";

type Props = {
  userId: string;
  username: string;
  initialUsername: string | null;
  /** Server: last time we pulled Last.fm / imported (cron or sync). */
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
  limit: number;
  matchedCount: number;
  skippedCount: number;
  error?: string | null;
  errorCode?: string | null;
};

type Highlight = {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string | null;
};

type UserListRow = {
  id: string;
  title: string;
  type: "album" | "song";
};

function PreviewSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5"
        >
          <div className="h-10 w-10 shrink-0 rounded bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-[60%] max-w-[12rem] rounded bg-zinc-800" />
            <div className="h-3 w-[40%] max-w-[8rem] rounded bg-zinc-800/80" />
          </div>
        </div>
      ))}
    </div>
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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  const [successToast, setSuccessToast] = useState<{
    imported: number;
    highlights: Highlight[];
  } | null>(null);

  const [addToListOpen, setAddToListOpen] = useState(false);
  const [lists, setLists] = useState<UserListRow[]>([]);
  const [listPickId, setListPickId] = useState<string>("");
  const [listAddBusy, setListAddBusy] = useState(false);
  const [lastImportTrackIds, setLastImportTrackIds] = useState<string[]>([]);

  useEffect(() => {
    setUsernameInput(initialUsername ?? "");
  }, [initialUsername]);

  useEffect(() => {
    setLastSyncedAt(initialLastSyncedAt ?? null);
  }, [initialLastSyncedAt]);

  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 14_000);
    return () => clearTimeout(t);
  }, [successToast]);

  const saveMutation = useMutation({
    mutationFn: async (next: string | null) => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastfm_username: next ?? "" }),
      });
      const data = (await res.json()) as {
        error?: string;
        lastfm_username?: string | null;
        lastfm_last_synced_at?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      let lastSynced: string | null = data.lastfm_last_synced_at ?? null;
      if (
        typeof data.lastfm_username === "string" &&
        data.lastfm_username.trim()
      ) {
        const syncRes = await fetch("/api/lastfm/sync", { method: "POST" });
        const syncJson = (await syncRes.json()) as {
          lastfm_last_synced_at?: string | null;
          warning?: string | null;
        };
        if (syncRes.ok && syncJson.lastfm_last_synced_at) {
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
      setUsernameInput(data.lastfm_username ?? "");
      setLastSyncedAt(data.lastfm_last_synced_at ?? null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profile(userId),
      });
      router.refresh();
    },
  });

  const previewQuery = useQuery({
    queryKey: [
      "lastfm",
      "preview",
      usernameInput.trim(),
      savedAt,
      previewNonce,
    ],
    queryFn: async () => {
      const res = await fetch("/api/lastfm/preview?limit=200", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      return data as PreviewResponse;
    },
    enabled: false,
  });

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const matchedItems = useMemo(
    () =>
      (previewQuery.data?.items ?? []).filter(
        (i) => i.matchStatus === "matched",
      ),
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
    setListPickId("");
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/lists?limit=50`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lists failed");
      const arr = Array.isArray(data) ? (data as UserListRow[]) : [];
      const songLists = arr.filter((l) => l.type === "song");
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
        const res = await fetch(`/api/lists/${listPickId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "song", entity_id: entityId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Add failed");
        }
      }
      setAddToListOpen(false);
      setSuccessToast(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profile(userId),
      });
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setListAddBusy(false);
    }
  }, [listPickId, lastImportTrackIds, queryClient, router, userId]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const items = matchedItems.filter((i) => selectedKeys.has(i.key));
      const entries = items
        .filter(
          (i): i is LastfmPreviewRow & { spotifyTrackId: string } =>
            i.spotifyTrackId != null,
        )
        .map((i) => ({
          spotifyTrackId: i.spotifyTrackId,
          listenedAt: i.listenedAtIso,
          albumId: i.albumId,
          artistId: i.artistId,
          trackName: i.trackName,
          artistName: i.artistName,
          artworkUrl: i.artworkUrl,
        }));
      if (entries.length === 0)
        throw new Error("Select at least one matched track");
      const res = await fetch("/api/lastfm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      return {
        ...data,
        _entries: entries,
      } as {
        imported: number;
        skipped?: number;
        message?: string;
        highlights?: Highlight[];
        _entries: typeof entries;
      };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.profile(userId),
      });
      setPreviewNonce((n) => n + 1);
      void queryClient.removeQueries({ queryKey: ["lastfm", "preview"] });
      setLastImportTrackIds([
        ...new Set(data._entries.map((e) => e.spotifyTrackId)),
      ]);
      setSuccessToast({
        imported: data.imported,
        highlights: data.highlights ?? [],
      });
      router.refresh();
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
  const showPreviewBody = previewQuery.data && !previewQuery.isFetching;

  const showConnectCta = !initialUsername?.trim();

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-lg font-semibold text-white">Last.fm</h2>
      {showConnectCta ? (
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/25 px-3 py-3">
          <p className="text-sm font-medium text-emerald-100/95">
            Connect Last.fm to power your data
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            Your listens sync from Last.fm first. Without this you can still use
            the app, but just have to log manually. We highly recommend
            connecting!
          </p>
        </div>
      ) : null}
      <p
        className={`text-sm text-zinc-500 ${showConnectCta ? "mt-3" : "mt-1"}`}
      >
        Save your public Last.fm username once. We sync new scrobbles
        automatically in the background (and once right after you save).
      </p>
      {usernameInput.trim() ? (
        <p className="mt-2 text-xs text-zinc-500">
          Last automatic sync:{" "}
          <span className="text-zinc-400">
            {formatLastSynced(lastSyncedAt)}
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium text-zinc-400">
            Last.fm username
          </label>
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="e.g. your_lastfm_name"
            autoCapitalize="none"
            autoCorrect="off"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(usernameInput.trim() || null)}
          className="shrink-0 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "Saving & syncing…" : "Save"}
        </button>
      </div>
      {saveMutation.isError && (
        <p className="mt-2 text-sm text-red-400">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Save failed"}
        </p>
      )}

      <details className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/30">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="text-zinc-300">Manual preview & import</span>
          <span className="ml-2 text-xs font-normal text-zinc-600">
            (optional — use automatic sync above)
          </span>
        </summary>
        <div className="border-t border-zinc-800/80 px-3 pb-4 pt-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!usernameInput.trim() || previewQuery.isFetching}
              onClick={() => void loadPreview()}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {previewQuery.isFetching ? "Loading preview…" : "Load preview"}
            </button>
            {matchedItems.length > 0 && !previewQuery.isFetching && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedKeys(new Set(matchedItems.map((i) => i.key)))
                  }
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800"
                >
                  Select all matched
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys(new Set())}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-800"
                >
                  Deselect all
                </button>
              </>
            )}
          </div>

          {previewQuery.isError && (
            <p className="mt-3 text-sm text-red-400">
              {previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "Could not load preview"}
            </p>
          )}

          {previewQuery.isFetching && <PreviewSkeleton />}

          {showPreviewBody && preview && (
            <>
              {preview.error ? (
                <p className="mt-3 text-sm text-amber-400/90">
                  {preview.error}
                </p>
              ) : (
                <p className="mt-3 text-sm text-zinc-400">
                  <span className="font-medium text-emerald-400/90">
                    {preview.matchedCount} matched
                  </span>
                  {" · "}
                  <span className="text-zinc-500">
                    {preview.skippedCount} skipped
                  </span>
                </p>
              )}
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-zinc-800">
                <ul className="divide-y divide-zinc-800">
                  {preview.items.map((row) => {
                    const matched = row.matchStatus === "matched";
                    const checked = selectedKeys.has(row.key);
                    return (
                      <li
                        key={row.key}
                        className="flex items-start gap-3 px-3 py-2.5 text-sm"
                      >
                        {matched ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKey(row.key)}
                            className="mt-1"
                          />
                        ) : (
                          <span className="mt-1 w-4 shrink-0 text-zinc-600">
                            —
                          </span>
                        )}
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                          {row.artworkUrl ? (
                            <img
                              src={row.artworkUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                              ♪
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white">
                            {row.trackName}
                          </p>
                          <p className="text-zinc-500">{row.artistName}</p>
                          {row.albumName ? (
                            <p className="text-xs text-zinc-600">
                              {row.albumName}
                            </p>
                          ) : null}
                          <p className="text-xs text-zinc-600">
                            {new Date(row.listenedAtIso).toLocaleString()}
                          </p>
                          {!matched && (
                            <p className="text-xs text-amber-500/90">
                              No Spotify match
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {matchedItems.length > 0 && !previewQuery.isFetching && (
            <button
              type="button"
              disabled={importMutation.isPending || selectedKeys.size === 0}
              onClick={() => importMutation.mutate()}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:w-auto"
            >
              {importMutation.isPending
                ? "Importing…"
                : `Import selected (${selectedKeys.size})`}
            </button>
          )}
          {importMutation.isError && (
            <p className="mt-2 text-sm text-red-400">
              {importMutation.error instanceof Error
                ? importMutation.error.message
                : "Import failed"}
            </p>
          )}
        </div>
      </details>

      {successToast && (
        <div
          className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm origin-bottom-right animate-[fadeInScale_0.35s_ease-out]"
          style={
            {
              ["--tw-enter-opacity" as string]: "1",
            } as React.CSSProperties
          }
        >
          <div className="pointer-events-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-sm">
            <p className="text-sm font-semibold text-white">
              Imported {successToast.imported} listens from Last.fm
            </p>
            {successToast.highlights.length > 0 && (
              <ul className="mt-3 space-y-2">
                {successToast.highlights.slice(0, 3).map((h) => (
                  <li
                    key={h.spotifyTrackId}
                    className="flex items-center gap-2 text-xs text-zinc-300"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-zinc-800">
                      {h.artworkUrl ? (
                        <img
                          src={h.artworkUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-600">
                          ♪
                        </div>
                      )}
                    </div>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white">
                        {h.trackName}
                      </span>
                      <span className="block truncate text-zinc-500">
                        {h.artistName}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/feed"
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
              >
                View your logs
              </Link>
              <button
                type="button"
                onClick={() => void openAddToList()}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Add to list
              </button>
              <button
                type="button"
                onClick={() => setSuccessToast(null)}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {addToListOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <p className="text-sm font-semibold text-white">
              Add imported tracks to a list
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Choose a song list. Tracks already on the list may return an error
              — safe to ignore.
            </p>
            {lists.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">
                No song lists yet. Create one from your profile.
              </p>
            ) : (
              <label className="mt-3 block text-xs text-zinc-400">
                List
                <select
                  value={listPickId}
                  onChange={(e) => setListPickId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddToListOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={listAddBusy || !listPickId || lists.length === 0}
                onClick={() => void addTracksToList()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {listAddBusy ? "Adding…" : "Add tracks"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
