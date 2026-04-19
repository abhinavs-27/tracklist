"use client";

import Link from "next/link";
import { memo } from "react";
import { CatalogArtworkPlaceholder } from "@/components/catalog-artwork-placeholder";
import { feedAlbumCoverUrl } from "@/lib/feed-artwork";
import type { FeedListenSession } from "@/types";

/** Match main feed collapse cap for "N songs" expand lists. */
export const LISTEN_SESSIONS_DISPLAY_CAP = 10;

export const ListenSessionRow = memo(function ListenSessionRow({
  session,
}: {
  session: FeedListenSession;
}) {
  const album = session.album;
  const image = feedAlbumCoverUrl(album ?? undefined);
  const trackName = session.track_name ?? album?.name ?? "Track";
  const artistName =
    session.artist_name ??
    album?.artists?.map((a) => a.name).join(", ") ??
    "";
  return (
    <Link
      href={`/album/${session.album_id}`}
      className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      {image ? (
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <CatalogArtworkPlaceholder size="sm" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white group-hover:text-emerald-400">
          {trackName}
        </p>
        {artistName ? (
          <p className="truncate text-xs text-zinc-500">{artistName}</p>
        ) : null}
      </div>
    </Link>
  );
});
