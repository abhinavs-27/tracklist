"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FavoriteAlbumsEditModal } from "./favorite-albums-edit-modal";
import { queryKeys } from "@/lib/query-keys";
import type { FavoriteAlbum } from "@/lib/queries";

type ProfileFavoriteAlbumsSectionProps = {
  userId?: string;
  favoriteAlbums: FavoriteAlbum[];
  isOwnProfile: boolean;
};

export function ProfileFavoriteAlbumsSection({
  userId,
  favoriteAlbums,
  isOwnProfile,
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
        <h2 className="text-lg font-semibold text-white">Favorite albums</h2>
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-full border border-zinc-600 bg-transparent px-3 py-1.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {favoriteAlbums.map((fav) => (
            <li key={fav.album_id}>
              <Link
                href={`/album/${fav.album_id}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 hover:border-emerald-500 hover:bg-zinc-900"
              >
                <div className="aspect-square w-full overflow-hidden rounded-md bg-zinc-800">
                  {fav.image_url ? (
                    <img
                      src={fav.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-500">
                      ♪
                    </div>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-medium text-white">
                  {fav.name}
                </p>
              </Link>
            </li>
          ))}
        </ul>
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
