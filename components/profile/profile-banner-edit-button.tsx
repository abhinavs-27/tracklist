"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FavoriteAlbumsEditModal } from "@/components/favorite-albums-edit-modal";
import { queryKeys } from "@/lib/query-keys";
import type { FavoriteAlbum } from "@/lib/queries";

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.25 2.25 0 013 3L8 18l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileBannerEditButton({
  userId,
  initialAlbums,
}: {
  userId: string;
  initialAlbums: FavoriteAlbum[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const items = initialAlbums.map((a) => ({
    album_id: a.album_id,
    name: a.name,
    image_url: a.image_url,
  }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={initialAlbums.length > 0 ? "Edit favorite albums" : "Add favorite albums"}
        className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
      >
        <PencilIcon />
        {initialAlbums.length > 0 ? "Edit" : "Add favorites"}
      </button>
      <FavoriteAlbumsEditModal
        initialAlbums={items}
        isOpen={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) });
          router.refresh();
        }}
      />
    </>
  );
}
