/**
 * Align album/artist attribution for a listen log.
 *
 * - Album: `songs.album_id`, then `logs.album_id` (Spotify sync denormalizes).
 * - Artist: prefer `logs.artist_id` (captured at ingest from `track.artists[0]`),
 *   then `songs.artist_id`, then the album's `artist_id`. That keeps top artists
 *   aligned with Spotify play metadata when the `songs` row is stale or incomplete.
 */
export function resolveAlbumArtistForAggregate(args: {
  song:
    | { artist_id: string | null; album_id: string | null }
    | undefined;
  logAlbumId: string | null;
  /** Spotify primary artist on the log (migration 052). */
  logArtistId?: string | null;
  albumArtistId: (albumId: string) => string | null | undefined;
}): { artistId: string | null; albumId: string | null } {
  let albumId: string | null = null;

  if (args.song) {
    albumId = args.song.album_id?.trim() || null;
  }
  const logAl = args.logAlbumId?.trim();
  if (!albumId && logAl) {
    albumId = logAl;
  }

  const logAr = args.logArtistId?.trim();
  const songAr = args.song?.artist_id?.trim();
  let artistId: string | null = null;
  if (logAr) {
    artistId = logAr;
  } else if (songAr) {
    artistId = songAr;
  } else if (albumId) {
    artistId = args.albumArtistId(albumId) ?? null;
  }

  return { artistId, albumId };
}
