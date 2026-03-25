export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  email?: string;
  bio?: string | null;
  created_at?: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

/** Passive listen — tracks only, no ratings or review text. */
export interface ListenLog {
  id: string;
  user_id: string;
  track_id: string;
  listened_at: string;
  source: string | null;
  created_at: string;
}

export interface ListenLogWithUser extends ListenLog {
  user?: User | null;
}

/** Active user action — rating and/or review for an album or track. */
export interface Review {
  id: string;
  user_id: string;
  entity_type: 'album' | 'song';
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithUser extends Review {
  /** Populated for UI display. Prefer this over the legacy entity_type/entity_id when possible. */
  user?: User | null;
  /** @deprecated use user.username */
  username?: string | null;
}

/** Listen session: one track in a 30-min window (or aggregated). */
export interface FeedListenSession {
  type: 'listen_session';
  user_id: string;
  track_id: string;
  album_id: string;
  song_count: number;
  first_listened_at: string;
  created_at: string;
  user?: User | null;
  /** From RPC (listen sessions from `logs`). */
  track_name?: string | null;
  artist_name?: string | null;
  /** Enriched by server for display. */
  album?: SpotifyApi.AlbumObjectSimplified | null;
}

/** Collapsed summary when same user has multiple listen_session items in a row. Expand shows up to 10 songs. */
export interface FeedListenSessionsSummary {
  type: 'listen_sessions_summary';
  user_id: string;
  /** Number of songs in this run (for "N songs" label). */
  song_count: number;
  created_at: string;
  user?: User | null;
  /** Up to 10 track-level sessions for expand view. */
  sessions: FeedListenSession[];
}

/** Feed v2 story kinds (stored in `feed_events.type`). */
export type FeedStoryKind =
  | "discovery"
  | "top-artist-shift"
  | "rating"
  | "streak"
  | "binge"
  | "new-list"
  | "milestone";

/** Insight-style feed row (not a raw log). */
export type FeedStoryActivity = {
  type: "feed_story";
  story_kind: FeedStoryKind;
  id: string;
  created_at: string;
  user?: User | null;
  payload: Record<string, unknown>;
};

/** Feed activity item: review, follow, listen session, collapsed listen summary, or feed v2 story. */
export type FeedActivity =
  | { type: 'review'; created_at: string; review: ReviewWithUser }
  | { type: 'follow'; id: string; created_at: string; follower_id: string; following_id: string; follower_username: string | null; following_username: string | null }
  | FeedListenSession
  | FeedListenSessionsSummary
  | FeedStoryActivity;

/** Recommendation from co-listening: album_id and co-occurrence score. */
export interface AlbumRecommendation {
  album_id: string;
  score: number;
}

export interface Like {
  id: string;
  user_id: string;
  review_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  review_id: string;
  content: string;
  created_at: string;
}

export interface List {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  spotify_id: string;
  type: 'song' | 'album';
}

export interface Favorite {
  id: string;
  user_id: string;
  spotify_id: string;
  type: 'song' | 'album';
}

export interface CommentWithUser extends Comment {
  user?: User;
}

// Spotify types
export interface SpotifyArtist {
  id: string;
  name: string;
  images?: { url: string; height?: number; width?: number }[];
  genres?: string[];
  followers?: { total: number };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images?: { url: string; height?: number; width?: number }[];
  release_date?: string;
  total_tracks?: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album?: { id: string; name: string; images?: { url: string }[] };
  duration_ms?: number;
}

// Taste match v2 (cached taste identity — artists + genres)
export type TasteMatchSharedArtist = {
  id: string;
  name: string;
  imageUrl?: string | null;
  listenCountUserA: number;
  listenCountUserB: number;
};

export type TasteMatchSharedGenre = {
  name: string;
  weightUserA: number;
  weightUserB: number;
};

export type TasteMatchResponse = {
  score: number;
  overlapScore: number;
  genreOverlapScore: number;
  discoveryScore: number;
  sharedArtists: TasteMatchSharedArtist[];
  sharedGenres: TasteMatchSharedGenre[];
  summary: string;
  insufficientData: boolean;
};

// Discover
export type DiscoverUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  latest_album_spotify_id: string | null;
  latest_log_created_at: string | null;
  is_following: boolean;
  is_viewer: boolean;
};

export type DiscoverUsersResponse = {
  users: DiscoverUser[];
};

export interface ReviewsResult {
  reviews: ReviewWithUser[];
  average_rating: number | null;
  count: number;
  my_review: ReviewWithUser | null;
}

export type UserSearchResult = {
  id: string;
  username: string;
  avatar_url: string | null;
  followers_count: number;
  is_following: boolean;
};

// Suggested users (getSuggestedUsers / discover block)
export type SuggestedUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  followers_count: number;
};

export type UserStreak = {
  current_streak: number;
  longest_streak: number;
  last_listen_date: string | null;
};

export type WeeklyReportRow = {
  id: string;
  user_id: string;
  week_start: string;
  listen_count: number;
  top_artist_id: string | null;
  top_album_id: string | null;
  top_track_id: string | null;
  created_at: string;
};

export type PeriodReportRow = {
  period_start: string;
  period_end: string;
  period_label: string;
  listen_count: number;
  top_artist_id: string | null;
  top_album_id: string | null;
  top_track_id: string | null;
};

export type WeeklyTopEntity = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

export type WeeklyListeningStoryStats = {
  totalLogs: number;
  uniqueArtists: number;
  newArtists: number;
  streakDays: number;
};

export type WeeklyListeningStoryComparison = {
  logsDiffPercent: number | null;
};

export type WeeklyListeningStoryPayload = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  stats: WeeklyListeningStoryStats;
  top: {
    artist: WeeklyTopEntity | null;
    album: WeeklyTopEntity | null;
    track: WeeklyTopEntity | null;
  };
  insights: string[];
  summary: string;
  comparison: WeeklyListeningStoryComparison;
};

export type TrendingEntity = {
  entity_id: string;
  entity_type: string;
  listen_count: number;
};

export type RisingArtist = {
  artist_id: string;
  name: string;
  avatar_url: string | null;
  growth: number;
};

export type HiddenGem = {
  entity_id: string;
  entity_type: string;
  avg_rating: number;
  listen_count: number;
};

export type SyncResponse = {
  inserted: number;
  skipped: number;
  mode: "song";
};

// API Request Bodies
export interface ReviewCreateBody {
  entity_type: 'album' | 'song';
  entity_id: string;
  rating: number;
  review_text?: string | null;
}

export interface LogCreateBody {
  track_id?: string;
  spotify_id?: string;
  listened_at?: string | number;
  source?: string;
  album_id?: string | null;
  artist_id?: string | null;
  note?: string | null;
}

export interface CommentCreateBody {
  review_id: string;
  content: string;
}

export interface FollowCreateBody {
  following_id: string;
}

export interface LikeCreateBody {
  review_id: string;
}

export interface ProfileUpdateBody {
  username?: string;
  bio?: string | null;
  lastfm_username?: string | null;
}
