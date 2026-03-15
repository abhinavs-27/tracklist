import Link from 'next/link';
import { memo } from 'react';

interface AlbumCardProps {
  album: SpotifyApi.AlbumObjectSimplified;
}

function AlbumCardInner({ album }: AlbumCardProps) {
  const image = album.images?.[0]?.url;
  const artistNames = album.artists?.map((a) => a.name).join(', ') ?? '';

  return (
    <Link
      href={`/album/${album.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      <div className="aspect-square w-full overflow-hidden bg-zinc-800">
        {image ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-600">
            ♪
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate font-medium text-white group-hover:text-emerald-400">{album.name}</p>
        <p className="truncate text-xs text-zinc-500">{artistNames}</p>
      </div>
    </Link>
  );
}

export const AlbumCard = memo(AlbumCardInner);
