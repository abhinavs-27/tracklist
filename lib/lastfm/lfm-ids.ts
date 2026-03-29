import { createHash } from "node:crypto";

/** Deterministic synthetic catalog id for a Last.fm artist string (before Spotify match). */
export function lfmArtistId(artistName: string): string {
  const h = createHash("sha256")
    .update(`artist|${artistName.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 16);
  return `lfm:${h}`;
}

/** Deterministic synthetic song id from Last.fm artist + track names. */
export function lfmSongId(artistName: string, trackName: string): string {
  const h = createHash("sha256")
    .update(
      `song|${artistName.toLowerCase().trim()}|${trackName.toLowerCase().trim()}`,
    )
    .digest("hex")
    .slice(0, 16);
  return `lfm:${h}`;
}

/** Deterministic synthetic album id from Last.fm artist + album title strings. */
export function lfmAlbumId(artistName: string, albumTitle: string): string {
  const h = createHash("sha256")
    .update(
      `album|${artistName.toLowerCase().trim()}|${albumTitle.toLowerCase().trim()}`,
    )
    .digest("hex")
    .slice(0, 16);
  return `lfm:${h}`;
}
