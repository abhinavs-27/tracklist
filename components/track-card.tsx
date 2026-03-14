import Link from 'next/link';
import Image from 'next/image';

interface TrackCardProps {
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified;
  showAlbum?: boolean;
  noLink?: boolean;
  /** When true, link to the song page instead of the album */
  songPageLink?: boolean;
  /** When false, hide the album-art thumbnail (e.g. on album page where cover is already shown) */
  showThumbnail?: boolean;
}

export function TrackCard({ track, showAlbum = true, noLink = false, songPageLink = false, showThumbnail = true }: TrackCardProps) {
  const artistNames = track.artists?.map((a) => a.name).join(', ') ?? '';
  const album = 'album' in track ? track.album : null;
  const image = album?.images?.[0]?.url;
  const albumId = album?.id;
  const href = noLink ? undefined : songPageLink ? `/song/${track.id}` : (albumId ? `/album/${albumId}` : undefined);

  const content = (
    <>
      {showThumbnail && (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
          {image ? (
            <Image src={image} alt={track.name} fill className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl text-zinc-600">♪</div>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white group-hover:text-emerald-400">{track.name}</p>
        <p className="truncate text-sm text-zinc-500">{artistNames}</p>
      </div>
      {showAlbum && album && (
        <p className="hidden truncate text-sm text-zinc-500 sm:block max-w-[120px]">{album.name}</p>
      )}
    </>
  );

  const className = "group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50";

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return <Link href={href} className={className}>{content}</Link>;
}
