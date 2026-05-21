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
  /** 4-axis style breakdown. Populated after taste refresh. null for new users. */
  styleResult?: TasteStyleResult | null;
};

// ── Listening style axis model ────────────────────────────────────────────────

export type AxisScore = {
  /** 0–100; 50 = neutral, 0 = fully left pole, 100 = fully right pole */
  score: number;
  /** |score - 50| — used to pick the strongest axis */
  deviation: number;
  pole: "left" | "right" | "neutral";
};

export type TasteAxes = {
  /** Devotee (0) ↔ Genre Nomad (100) */
  range: AxisScore;
  /** The Archivist (0) ↔ Cultural Pulse (100). null if no Spotify popularity data. */
  signal: AxisScore | null;
  /** Daily Ritual (0) ↔ Session Maximalist (100). null if < 4 weeks of aggregates. */
  mode: AxisScore | null;
  /** The Loyalist (0) ↔ The Explorer (100). null if < 8 weeks history or < 50 recent plays. */
  discovery: AxisScore | null;
};

export type TasteStyleResult = {
  /** Primary identity label — the axis with the highest deviation from neutral */
  primary: TasteListeningStyle;
  /** Short badge label for the second-strongest axis, or null */
  badge: string | null;
  /** Full axis breakdown for the profile widget */
  axes: TasteAxes;
};
