import { MediaHeader } from "./MediaHeader";

type Props = {
  artworkUrl: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  artistId?: string | null;
  onPressArtist?: (artistId: string) => void;
  trackCount?: number;
  totalDurationMs?: number;
  showLabel?: boolean;
};

function getReleaseYear(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const d = new Date(releaseDate);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function formatDuration(totalMs: number): string {
  const min = Math.round(totalMs / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

export function AlbumHeader({
  artworkUrl, title, artist, releaseDate,
  artistId, onPressArtist, trackCount, totalDurationMs,
  showLabel = true,
}: Props) {
  const parts: string[] = [];
  const year = getReleaseYear(releaseDate);
  if (year != null) parts.push(String(year));
  if (trackCount) parts.push(`${trackCount} tracks`);
  if (totalDurationMs) parts.push(formatDuration(totalDurationMs));

  return (
    <MediaHeader
      label={showLabel ? "Album" : undefined}
      artworkUrl={artworkUrl}
      title={title}
      subtitle={artist}
      detailLine={parts.length > 0 ? parts.join(" · ") : null}
      onPressSubtitle={artistId && onPressArtist ? () => onPressArtist(artistId) : undefined}
    />
  );
}
