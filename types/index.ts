export type LogType = 'song' | 'album';

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

export interface Log {
  id: string;
  user_id: string;
  spotify_id: string;
  type: LogType;
  title: string | null;
  rating: number;
  review: string | null;
  listened_at: string;
  created_at: string;
}

export interface Like {
  id: string;
  user_id: string;
  log_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  log_id: string;
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
  type: LogType;
}

export interface Favorite {
  id: string;
  user_id: string;
  spotify_id: string;
  type: LogType;
}

// API / joined types
export interface LogWithUser extends Log {
  user?: User | null;
  like_count?: number;
  comment_count?: number;
  liked?: boolean;
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
