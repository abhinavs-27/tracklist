/** Normalized Last.fm scrobble before Spotify mapping. */
export type LastfmNormalizedScrobble = {
  /** Stable key for selection (import round-trip). */
  key: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  listenedAtIso: string;
  artworkUrl: string | null;
};

/** One row in the import preview API. */
export type LastfmPreviewRow = LastfmNormalizedScrobble & {
  matchStatus: "matched" | "unmatched";
  spotifyTrackId: string | null;
  albumId: string | null;
  artistId: string | null;
};

/** Client sends selected entries to import (matched rows only). */
export type LastfmImportEntry = {
  spotifyTrackId: string;
  listenedAt: string;
  albumId?: string | null;
  artistId?: string | null;
  /** Optional display fields for success UI (not stored on logs). */
  trackName?: string;
  artistName?: string;
  artworkUrl?: string | null;
};
