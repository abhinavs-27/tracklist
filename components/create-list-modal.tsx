"use client";

import { useState, useCallback, useEffect } from "react";
import type { SpotifyApi } from "spotify-types";
import { useRouter } from "next/navigation";

type CreateListModalProps = {
  onClose: () => void;
  onSuccess?: (listId: string) => void;
};

export function CreateListModal({ onClose, onSuccess }: CreateListModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"album" | "song">("album");
  const [query, setQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    { id: string; name: string; imageUrl?: string | null }[]
  >([]);
  const [visibility, setVisibility] = useState<
    "public" | "friends" | "private"
  >("private");
  const [searchResults, setSearchResults] = useState<SpotifyApi.SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setSearchResults(null);
        setSelectedItems([]);
        return;
      }
      setSearchLoading(true);
      setError("");
      try {
        const typeParam = type === "album" ? "album" : "track";
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=${typeParam}&limit=10`,
        );
        if (!res.ok) {
          setSearchResults(null);
          return;
        }
        const data = (await res.json()) as SpotifyApi.SearchResponse;
        setSearchResults(data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    },
    [type],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) search(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const t = title.trim();
    if (!t) {
      setError("Title is required");
      return;
    }
    if (t.length > 100) {
      setError("Title must be 100 characters or less");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: description.trim() || null,
          type,
          visibility,
          initial_items:
            selectedItems.length > 0
              ? selectedItems.map((i) => ({
                  entity_type: type,
                  entity_id: i.id,
                }))
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create list");
        return;
      }
      onSuccess?.(data.id);
      router.push(`/lists/${data.id}`);
      onClose();
    } catch (e) {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-list-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 id="create-list-title" className="text-lg font-semibold text-white">
          Create new list
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="list-title" className="block text-sm font-medium text-zinc-300">
              Title
            </label>
            <input
              id="list-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="My favorites"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              required
            />
            <p className="mt-0.5 text-xs text-zinc-500">{title.length}/100</p>
          </div>
          <div>
            <label htmlFor="list-desc" className="block text-sm font-medium text-zinc-300">
              Description (optional)
            </label>
            <textarea
              id="list-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A few words about this list..."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-zinc-300">List type</p>
            <div className="flex gap-4 text-sm text-zinc-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="list-type"
                  value="album"
                  checked={type === "album"}
                  onChange={() => {
                    setType("album");
                    setSelectedItems([]);
                    setSearchResults(null);
                    setQuery("");
                  }}
                />
                <span>Albums</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="list-type"
                  value="song"
                  checked={type === "song"}
                  onChange={() => {
                    setType("song");
                    setSelectedItems([]);
                    setSearchResults(null);
                    setQuery("");
                  }}
                />
                <span>Songs</span>
              </label>
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-zinc-300">Visibility</p>
            <div className="flex flex-col gap-1 text-sm text-zinc-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="list-visibility"
                  value="public"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                <span>Public</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="list-visibility"
                  value="friends"
                  checked={visibility === "friends"}
                  onChange={() => setVisibility("friends")}
                />
                <span>Friends only</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="list-visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                <span>Private</span>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-300">
              Add items (optional)
            </p>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                type === "album" ? "Search albums..." : "Search tracks..."
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchLoading && (
              <p className="text-xs text-zinc-500">Searching…</p>
            )}
            {searchResults && !searchLoading && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 text-sm">
                {(type === "album"
                  ? searchResults.albums?.items ?? []
                  : searchResults.tracks?.items ?? []
                ).map((item) => {
                  const imageUrl =
                    type === "album"
                      ? (item as SpotifyApi.AlbumObjectSimplified).images?.[0]?.url
                      : (item as SpotifyApi.TrackObjectSimplified).album?.images?.[0]?.url;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const exists = selectedItems.some((p) => p.id === item.id);
                          if (exists) {
                            setSelectedItems((prev) => prev.filter((p) => p.id !== item.id));
                            return;
                          }
                          setSelectedItems((prev) => [
                            ...prev,
                            { id: item.id, name: item.name, imageUrl: imageUrl ?? null },
                          ]);
                          setQuery("");
                          setSearchResults(null);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800 ${
                          selectedItems.some((p) => p.id === item.id)
                            ? "bg-zinc-800"
                            : ""
                        }`}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">
                            ♪
                          </div>
                        )}
                        <span className="min-w-0 truncate text-white">{item.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedItems.length > 0 && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Added to list ({selectedItems.length})
                </p>
                <ul className="space-y-1.5">
                  {selectedItems.map((item, index) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg bg-zinc-900/80 py-1.5 pl-2 pr-1"
                    >
                      <span className="w-5 shrink-0 text-right text-xs text-zinc-500">
                        {index + 1}
                      </span>
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">
                          ♪
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-white">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedItems((prev) => prev.filter((p) => p.id !== item.id))
                        }
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
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create list"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
