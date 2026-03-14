export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
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
  user?: User | null;
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

// Taste match
export type TasteMatchSharedAlbum = {
  spotify_id: string;
  rating_userA?: number | null;
  rating_userB?: number | null;
};

export type TasteMatchResponse = {
  score: number; // 0-100
  sharedAlbumCount: number;
  sharedAlbums: TasteMatchSharedAlbum[];
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
