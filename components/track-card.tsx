import Link from 'next/link';
import { memo } from 'react';
import { CatalogArtworkPlaceholder } from '@/components/catalog-artwork-placeholder';

interface TrackCardProps {
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified;
  showAlbum?: boolean;
  noLink?: boolean;
  /** When true, link to the song page instead of the album */
  songPageLink?: boolean;
  /** When false, hide the album-art thumbnail (e.g. on album page where cover is already shown) */
  showThumbnail?: boolean;
  /** Plays + optional rating line (artist popular tracks). */
  engagement?: {
    playCount: number;
    avgRating: number | null;
    ratingCount: number;
  };
}

function TrackCardInner({
  track,
  showAlbum = true,
  noLink = false,
  songPageLink = false,
  showThumbnail = true,
  engagement,
}: TrackCardProps) {
  const artistNames = track.artists?.map((a) => a.name).join(', ') ?? '';
  const album = 'album' in track ? track.album : null;
  const image = album?.images?.[0]?.url;
  const albumId = album?.id;
  const href = noLink ? undefined : songPageLink ? `/song/${track.id}` : (albumId ? `/album/${albumId}` : undefined);

  const content = (
    <>
      {showThumbnail && (
        <div className="h-12 w-12 shrink-0">
          {image ? (
            <div className="h-12 w-12 overflow-hidden rounded bg-zinc-800">
              <img src={image} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <CatalogArtworkPlaceholder size="md" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white group-hover:text-emerald-400 sm:text-base">
          {track.name}
        </p>
        <p className="truncate text-xs text-zinc-500 sm:text-sm">{artistNames}</p>
        {engagement ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-zinc-400">
            <span>{engagement.playCount.toLocaleString()} plays</span>
            {engagement.avgRating != null && engagement.ratingCount > 0 ? (
              <span className="text-amber-400">
                ★ {engagement.avgRating.toFixed(1)} ({engagement.ratingCount})
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {showAlbum && album && (
        <p className="hidden truncate text-sm text-zinc-500 sm:block max-w-[120px]">{album.name}</p>
      )}
    </>
  );

  const className =
    "group flex min-h-[44px] touch-manipulation items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/50 active:bg-zinc-800/60";

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return <Link href={href} className={className}>{content}</Link>;
}

export const TrackCard = memo(TrackCardInner);
