/**
 * Mirrors web `FeedActivity` / API `/api/feed` items (enriched server-side).
 */

export type FeedUser = {
  id?: string;
  username: string;
  avatar_url: string | null;
};

export type FeedReviewInner = {
  id: string;
  user_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  user?: FeedUser | null;
};

export type FeedAlbumLite = {
  id?: string;
  name?: string;
  images?: { url: string }[];
  artists?: { name: string }[];
};

export type FeedListenSession = {
  type: "listen_session";
  user_id: string;
  track_id: string;
  album_id: string;
  song_count: number;
  first_listened_at: string;
  created_at: string;
  user?: FeedUser | null;
  track_name?: string | null;
  artist_name?: string | null;
  album?: FeedAlbumLite | null;
};

export type FeedListenSessionsSummary = {
  type: "listen_sessions_summary";
  user_id: string;
  song_count: number;
  created_at: string;
  user?: FeedUser | null;
  sessions: FeedListenSession[];
};

export type FeedStoryKind =
  | "discovery"
  | "top-artist-shift"
  | "rating"
  | "streak"
  | "binge"
  | "new-list"
  | "milestone";

export type FeedStoryActivity = {
  type: "feed_story";
  story_kind: FeedStoryKind;
  id: string;
  created_at: string;
  user?: FeedUser | null;
  payload: Record<string, unknown>;
};

export type FeedActivity =
  | {
      type: "review";
      created_at: string;
      review: FeedReviewInner;
      spotifyName?: string;
    }
  | {
      type: "follow";
      id: string;
      created_at: string;
      follower_id: string;
      following_id: string;
      follower_username: string | null;
      following_username: string | null;
    }
  | FeedListenSession
  | FeedListenSessionsSummary
  | FeedStoryActivity;

export type FeedPageResponse = {
  items: FeedActivity[];
  nextCursor: string | null;
  events?: FeedStoryActivity[];
};
