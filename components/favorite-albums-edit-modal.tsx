"use client";

import { useState, useEffect } from "react";
import {
  FavoriteAlbumsPicker,
  type FavoriteAlbumPick,
} from "@/components/favorite-albums-picker";

type FavoriteAlbumsEditModalProps = {
  initialAlbums: FavoriteAlbumPick[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function FavoriteAlbumsEditModal({
  initialAlbums,
  isOpen,
  onClose,
  onSaved,
}: FavoriteAlbumsEditModalProps) {
  const [selected, setSelected] = useState<FavoriteAlbumPick[]>([]);
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
      setError("");
    }
  }, [isOpen, initialAlbums]);

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="favorite-albums-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 id="favorite-albums-modal-title" className="text-lg font-semibold text-white">
          Favorite albums
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pick up to 4 albums to feature on your profile.
        </p>

        <div className="mt-4">
          <FavoriteAlbumsPicker
            value={selected}
            onChange={setSelected}
            disabled={saving}
            searchInputId="fav-album-search-modal"
          />
        </div>

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
