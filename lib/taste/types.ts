export type TasteTopArtist = {
  id: string;
  name: string;
  listenCount: number;
  /** Spotify artist image when cached */
  imageUrl?: string | null;
};

export type TasteTopAlbum = {
  id: string;
  name: string;
  artistName: string;
  listenCount: number;
  imageUrl?: string | null;
};

export type TasteGenre = {
  name: string;
  weight: number;
};

import type { TasteListeningStyle } from "./listening-style";

export type { TasteListeningStyle };

export type TasteIdentity = {
  topArtists: TasteTopArtist[];
  topAlbums: TasteTopAlbum[];
  topGenres: TasteGenre[];
  /** 0–100 from track popularity; null if no track popularity data */
  obscurityScore: number | null;
  /** Distinct genre tags (0–10), not a percentage. */
  diversityScore: number;
  listeningStyle: TasteListeningStyle;
  avgTracksPerSession: number;
  totalLogs: number;
  /** Short human-readable blurb */
  summary: string;
};
