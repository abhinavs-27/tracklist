"use client";

import { useState, useCallback, useEffect } from "react";
import type { SpotifySearchResponse } from "@/lib/spotify";

type FavoriteAlbumItem = {
  album_id: string;
  name: string;
  image_url: string | null;
};

type FavoriteAlbumsEditModalProps = {
  initialAlbums: FavoriteAlbumItem[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const MAX_FAVORITES = 4;

export function FavoriteAlbumsEditModal({
  initialAlbums,
  isOpen,
  onClose,
  onSaved,
}: FavoriteAlbumsEditModalProps) {
  const [selected, setSelected] = useState<FavoriteAlbumItem[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifySearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelected(
        initialAlbums.map((a) => ({
          album_id: a.album_id,
          name: a.name,
          image_url: a.image_url,
        })),
      );
      setQuery("");
      setSearchResults(null);
      setError("");
    }
  }, [isOpen, initialAlbums]);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&type=album&limit=10`,
      );
      if (!res.ok) {
        setSearchResults(null);
        return;
      }
      const data = (await res.json()) as SpotifySearchResponse;
      setSearchResults(data);
    } catch {
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (query.trim()) search(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, isOpen, search]);

  const addAlbum = (id: string, name: string, imageUrl: string | null) => {
    if (selected.some((a) => a.album_id === id)) return;
    if (selected.length >= MAX_FAVORITES) return;
    setSelected((prev) => [...prev, { album_id: id, name, image_url: imageUrl }]);
    setQuery("");
    setSearchResults(null);
  };

  const removeAlbum = (albumId: string) => {
    setSelected((prev) => prev.filter((a) => a.album_id !== albumId));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/users/me/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albums: selected.map((a) => a.album_id),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const albums = searchResults?.albums?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorite-albums-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 id="favorite-albums-modal-title" className="text-lg font-semibold text-white">
          Favorite albums
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pick up to {MAX_FAVORITES} albums to feature on your profile.
        </p>

        <div className="mt-4">
          <label htmlFor="fav-album-search" className="block text-sm font-medium text-zinc-300">
            Search albums
          </label>
          <input
            id="fav-album-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Album name"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {searchLoading && <p className="mt-1 text-xs text-zinc-500">Searching…</p>}
          {searchResults && !searchLoading && albums.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-sm">
              {albums.map((item) => {
                const imageUrl = item.images?.[0]?.url ?? null;
                const alreadySelected = selected.some((a) => a.album_id === item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        !alreadySelected && selected.length < MAX_FAVORITES
                          ? addAlbum(item.id, item.name, imageUrl)
                          : undefined
                      }
                      disabled={alreadySelected || selected.length >= MAX_FAVORITES}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-transparent ${
                        alreadySelected ? "bg-zinc-800" : ""
                      }`}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-700 text-xs text-zinc-500">
                          ♪
                        </div>
                      )}
                      <span className="min-w-0 truncate text-white">{item.name}</span>
                      {alreadySelected && (
                        <span className="shrink-0 text-xs text-zinc-500">Added</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/60 p-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Your picks ({selected.length}/{MAX_FAVORITES})
            </p>
            <ul className="space-y-1.5">
              {selected.map((item, index) => (
                <li
                  key={item.album_id}
                  className="flex items-center gap-2 rounded-lg bg-zinc-900/80 py-1.5 pl-2 pr-1"
                >
                  <span className="w-5 shrink-0 text-right text-xs text-zinc-500">
                    {index + 1}
                  </span>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-700 text-xs text-zinc-500">
                      ♪
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAlbum(item.album_id)}
                    className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-red-400"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
