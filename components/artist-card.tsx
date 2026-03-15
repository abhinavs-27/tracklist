import { PrefetchLink } from '@/components/prefetch-link';

interface ArtistCardProps {
  artist: SpotifyApi.ArtistObjectFull | SpotifyApi.ArtistObjectSimplified & { images?: SpotifyApi.ImageObject[] };
}

export function ArtistCard({ artist }: ArtistCardProps) {
  const image = 'images' in artist && artist.images?.length ? artist.images[0]?.url : null;

  return (
    <PrefetchLink
      href={`/artist/${artist.id}`}
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
        <p className="truncate font-medium text-white group-hover:text-emerald-400">{artist.name}</p>
        <p className="text-xs text-zinc-500">Artist</p>
      </div>
    </PrefetchLink>
  );
}
