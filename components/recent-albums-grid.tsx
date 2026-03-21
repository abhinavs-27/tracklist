"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RecentAlbumItem = {
  album_id: string;
  album_name: string | null;
  artist_name: string;
  album_image: string | null;
  last_played_at: string;
};

export function RecentAlbumsGrid({
  userId,
  refreshKey,
}: {
  userId: string;
  refreshKey?: number | string;
}) {
  const [albums, setAlbums] = useState<RecentAlbumItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/recent-albums?user_id=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load recent albums (${res.status})`);
        return res.json();
      })
      .then((data: { albums: RecentAlbumItem[] }) => {
        if (!cancelled) setAlbums(data.albums ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load recent albums");
          setAlbums([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (error) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="text-lg font-semibold text-white">Recent albums</h2>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
      </section>
    );
  }

  if (albums === null) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Recent albums</h2>
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Recent albums</h2>
        {albums.length > 0 ? (
          <p className="text-xs text-zinc-500">Last {albums.length}</p>
        ) : null}
      </div>

      {albums.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-500">No recent albums.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Log listens (Spotify sync, Last.fm, or quick log) to see albums here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {albums.map((album) => {
            const lastPlayed = new Date(album.last_played_at).toLocaleDateString();
            return (
              <Link
                key={album.album_id}
                href={`/album/${album.album_id}`}
                className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                aria-label={album.album_name ?? "Album"}
              >
                {album.album_image ? (
                  <img
                    src={album.album_image}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-600">
                    ♪
                  </div>
                )}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-zinc-200">
                      {album.album_name ?? "Unknown album"}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {album.artist_name || "—"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {lastPlayed}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
