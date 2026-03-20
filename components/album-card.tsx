import { memo } from 'react';
import { PrefetchLink } from '@/components/prefetch-link';

interface AlbumCardProps {
  album: SpotifyApi.AlbumObjectSimplified;
}

function AlbumCardInner({ album }: AlbumCardProps) {
  const image = album.images?.[0]?.url;
  const artistNames = album.artists?.map((a) => a.name).join(', ') ?? '';

  return (
    <PrefetchLink
      href={`/album/${album.id}`}
      className="group flex min-h-0 touch-manipulation flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-600 hover:bg-zinc-800/50"
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
        <p className="truncate text-sm font-medium text-white group-hover:text-emerald-400 sm:text-base">
          {album.name}
        </p>
        <p className="truncate text-[11px] text-zinc-500 sm:text-xs">{artistNames}</p>
      </div>
    </PrefetchLink>
  );
}

export const AlbumCard = memo(AlbumCardInner);
