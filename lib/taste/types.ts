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

/** Rolling windows for “this week vs month” copy and 7d genre pills (from `taste_identity_cache` after refresh). */
export type TasteRecentSnapshot = {
  logCount7d: number;
  logCount30d: number;
  topGenres7d: TasteGenre[];
  topGenres30d: TasteGenre[];
  /** Compares last 7d vs last 30d genre mix. */
  insightWeek: string;
};

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
  /** Present after identity refresh when enough recent logs exist. */
  recent?: TasteRecentSnapshot | null;
};
