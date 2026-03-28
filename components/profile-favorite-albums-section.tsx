"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FavoriteAlbumsEditModal } from "./favorite-albums-edit-modal";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { queryKeys } from "@/lib/query-keys";
import type { FavoriteAlbum } from "@/lib/queries";

type ProfileFavoriteAlbumsSectionProps = {
  userId?: string;
  favoriteAlbums: FavoriteAlbum[];
  isOwnProfile: boolean;
  /** Hide H2 when a parent SectionBlock provides the title */
  showHeading?: boolean;
};

export function ProfileFavoriteAlbumsSection({
  userId,
  favoriteAlbums,
  isOwnProfile,
  showHeading = true,
}: ProfileFavoriteAlbumsSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const items = favoriteAlbums.map((a) => ({
    album_id: a.album_id,
    name: a.name,
    image_url: a.image_url,
  }));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        {showHeading ? (
          <h2 className="text-base font-semibold text-white sm:text-lg">Favorite albums</h2>
        ) : (
          <span className="sr-only">Favorite albums</span>
        )}
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-transparent px-3 py-2 text-sm font-medium text-zinc-300 touch-manipulation hover:border-zinc-500 hover:text-white"
          >
            {favoriteAlbums.length > 0 ? "Edit" : "Add albums"}
          </button>
        )}
      </div>
      {favoriteAlbums.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {isOwnProfile
            ? "Pick up to 4 favorite albums to feature here."
            : "No favorite albums yet."}
        </p>
      ) : (
        <MediaGrid
          items={favoriteAlbums.map(
            (fav): MediaItem => ({
              id: fav.album_id,
              type: "album",
              title: fav.name,
              artist: "",
              artworkUrl: fav.image_url ?? null,
            }),
          )}
        />
      )}
      <FavoriteAlbumsEditModal
        initialAlbums={items}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          if (userId)
            queryClient.invalidateQueries({
              queryKey: queryKeys.favorites(userId),
            });
          router.refresh();
        }}
      />
    </section>
  );
}
