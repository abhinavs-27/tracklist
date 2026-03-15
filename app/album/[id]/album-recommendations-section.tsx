"use client";

import { AlbumCard } from "@/components/album-card";

type Props = {
  albums: SpotifyApi.AlbumObjectSimplified[];
  albumName: string;
};

export function AlbumRecommendationsSection({ albums, albumName }: Props) {
  if (albums.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">Recommended Albums</h2>
      <p className="mb-3 text-sm text-zinc-400">Because you listened to {albumName}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((rec) => (
          <AlbumCard key={rec.id} album={rec} />
        ))}
      </div>
    </section>
  );
}
