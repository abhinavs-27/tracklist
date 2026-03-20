import { MediaHeader } from "./MediaHeader";

type Props = {
  artworkUrl: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  /** Primary Spotify artist id for navigation. */
  artistId?: string | null;
  onPressArtist?: (artistId: string) => void;
};

function getReleaseYear(releaseDate: string | null) {
  if (!releaseDate) return null;
  const d = new Date(releaseDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

/** Album detail header — uses {@link MediaHeader}. */
export function AlbumHeader({
  artworkUrl,
  title,
  artist,
  releaseDate,
  artistId,
  onPressArtist,
}: Props) {
  const releaseYear = getReleaseYear(releaseDate);
  return (
    <MediaHeader
      artworkUrl={artworkUrl}
      title={title}
      subtitle={artist}
      detailLine={releaseYear != null ? String(releaseYear) : null}
      onPressSubtitle={
        artistId && onPressArtist ? () => onPressArtist(artistId) : undefined
      }
    />
  );
}
