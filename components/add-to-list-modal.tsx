"use client";

import { useState, useEffect, useCallback } from "react";
import { TrackCard } from "@/components/track-card";
import { useToast } from "@/components/toast";

type AddToListModalProps = {
  listId: string;
  listType: "album" | "song";
  onClose: () => void;
  onAdded?: () => void;
  onOptimisticAdd?: (
    entityType: "album" | "song",
    entityId: string,
    album?: SpotifyApi.AlbumObjectSimplified,
    track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull
  ) => void;
  onAddFailed?: () => void;
};

type SearchResult = {
  albums?: { items?: SpotifyApi.AlbumObjectSimplified[] };
  tracks?: { items?: SpotifyApi.TrackObjectSimplified[] };
};

export function AddToListModal({
  listId,
  listType,
  onClose,
  onAdded,
  onOptimisticAdd,
  onAddFailed,
}: AddToListModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults(null);
      return;
    }
      setLoading(true);
    setError("");
    try {
        const typeParam = listType === "album" ? "album" : "track";
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(
            trimmed,
          )}&type=${typeParam}&limit=15`,
        );
      if (!res.ok) {
        setResults(null);
        setError("Search failed");
        return;
      }
      const data = await res.json();
      setResults(data);
    } catch {
      setResults(null);
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const addAlbum = async (album: SpotifyApi.AlbumObjectSimplified) => {
    setAdding(album.id);
    setError("");
    onOptimisticAdd?.("album", album.id, album);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "album", entity_id: album.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add");
        onAddFailed?.();
        toast("Action failed, please try again.");
        return;
      }
      onAdded?.();
      onClose();
    } catch {
      setError("Failed to add");
      onAddFailed?.();
      toast("Action failed, please try again.");
    } finally {
      setAdding(null);
    }
  };

  const addTrack = async (track: SpotifyApi.TrackObjectSimplified) => {
    setAdding(track.id);
    setError("");
    onOptimisticAdd?.("song", track.id, undefined, track);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "song", entity_id: track.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add");
        onAddFailed?.();
        toast("Action failed, please try again.");
        return;
      }
      onAdded?.();
      onClose();
    } catch {
      setError("Failed to add");
      onAddFailed?.();
      toast("Action failed, please try again.");
    } finally {
      setAdding(null);
    }
  };

  const albums = results?.albums?.items ?? [];
  const tracks = results?.tracks?.items ?? [];
  const hasResults = albums.length > 0 || tracks.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-list-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 id="add-to-list-title" className="text-lg font-semibold text-white">
          Add to list
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            listType === "album"
              ? "Search albums..."
              : "Search tracks..."
          }
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          autoFocus
        />
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="text-sm text-zinc-500">Searching…</p>}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {!loading && query.trim() && !hasResults && (
            <p className="text-sm text-zinc-500">
              {listType === "album"
                ? "No albums found."
                : "No tracks found."}
            </p>
          )}
          {!loading && hasResults && (
            <div className="space-y-4">
              {listType === "album" && albums.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Albums</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {albums.slice(0, 6).map((album) => {
                      const image = album.images?.[0]?.url;
                      const artists = album.artists?.map((a) => a.name).join(", ") ?? "";
                      return (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() => addAlbum(album)}
                          disabled={adding !== null}
                          className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 text-left transition hover:border-zinc-600 hover:bg-zinc-800/50"
                        >
                          <div className="aspect-square w-full overflow-hidden bg-zinc-800">
                            {image ? (
                              <img src={image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-600">
                                ♪
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="truncate text-sm font-medium text-white">{album.name}</p>
                            <p className="truncate text-xs text-zinc-500">{artists}</p>
                            {adding === album.id && (
                              <p className="mt-1 text-xs text-emerald-400">Adding…</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {listType === "song" && tracks.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">Tracks</p>
                  <ul className="space-y-1">
                    {tracks.slice(0, 5).map((track) => (
                      <li key={track.id}>
                        <button
                          type="button"
                          onClick={() => addTrack(track)}
                          disabled={adding !== null}
                          className="w-full text-left"
                        >
                          <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-2 transition hover:bg-zinc-700/50">
                            <TrackCard
                              track={track}
                              showAlbum={true}
                              noLink
                              showThumbnail={true}
                            />
                            {adding === track.id && (
                              <p className="mt-1 text-xs text-emerald-400">Adding…</p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
