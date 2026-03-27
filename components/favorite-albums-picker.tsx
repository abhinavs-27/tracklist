"use client";

import { useCallback, useEffect, useState } from "react";
import type { SpotifySearchResponse } from "@/lib/spotify";

export type FavoriteAlbumPick = {
  album_id: string;
  name: string;
  image_url: string | null;
};

export const MAX_FAVORITE_ALBUMS = 4;

type Props = {
  value: FavoriteAlbumPick[];
  onChange: (next: FavoriteAlbumPick[]) => void;
  disabled?: boolean;
  searchInputId?: string;
};

export function FavoriteAlbumsPicker({
  value,
  onChange,
  disabled,
  searchInputId = "fav-album-search",
}: Props) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifySearchResponse | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
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
    const t = setTimeout(() => {
      if (query.trim()) search(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const addAlbum = (id: string, name: string, imageUrl: string | null) => {
    if (value.some((a) => a.album_id === id)) return;
    if (value.length >= MAX_FAVORITE_ALBUMS) return;
    onChange([...value, { album_id: id, name, image_url: imageUrl }]);
    setQuery("");
    setSearchResults(null);
  };

  const removeAlbum = (albumId: string) => {
    onChange(value.filter((a) => a.album_id !== albumId));
  };

  const albums = searchResults?.albums?.items ?? [];

  return (
    <div>
      <label htmlFor={searchInputId} className="block text-sm font-medium text-zinc-300">
        Search albums
      </label>
      <input
        id={searchInputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Album name"
        disabled={disabled}
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
      />
      {searchLoading && (
        <p className="mt-1 text-xs text-zinc-500">Searching…</p>
      )}
      {searchResults && !searchLoading && albums.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-sm">
          {albums.map((item) => {
            const imageUrl = item.images?.[0]?.url ?? null;
            const alreadySelected = value.some((a) => a.album_id === item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    !alreadySelected && value.length < MAX_FAVORITE_ALBUMS
                      ? addAlbum(item.id, item.name, imageUrl)
                      : undefined
                  }
                  disabled={
                    disabled ||
                    alreadySelected ||
                    value.length >= MAX_FAVORITE_ALBUMS
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-transparent ${
                    alreadySelected ? "bg-zinc-800" : ""
                  }`}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
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

      {value.length > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/60 p-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Your picks ({value.length}/{MAX_FAVORITE_ALBUMS})
          </p>
          <ul className="space-y-1.5">
            {value.map((item, index) => (
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
                    referrerPolicy="no-referrer"
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
                  disabled={disabled}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-red-400 disabled:opacity-50"
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
