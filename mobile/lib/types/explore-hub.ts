import type { TrendingEntity } from "@repo/types";

/** Serialized Spotify track shape from Explore APIs (JSON). */
export type ExploreHubTrackJson = {
  id: string;
  name: string;
  album?: {
    images?: Array<{ url?: string | null } | null>;
  } | null;
  artists?: Array<{ name?: string | null } | null>;
};

export type ExploreHubTrendingItem = {
  entity: TrendingEntity;
  track: ExploreHubTrackJson | null;
};

/** Mirrors `LeaderboardEntry` from `lib/queries` (API JSON). */
export type ExploreHubLeaderboardEntry = {
  id: string;
  entity_type: "song" | "album";
  name: string;
  artist: string;
  artwork_url: string | null;
  total_plays: number;
  average_rating: number | null;
};

export type ExploreDiscoverLink = {
  href: string;
  label: string;
  variant: "primary" | "secondary";
};

export type ExploreDiscoverPayload = {
  headline: string;
  description: string;
  links: ExploreDiscoverLink[];
};

export type ExploreReviewPreviewRow = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  entity_id: string;
  album_name: string;
  artist_name: string;
  rating: number;
  created_at: string;
};

export type ExploreHubResponse = {
  trending: ExploreHubTrendingItem[];
  leaderboard: ExploreHubLeaderboardEntry[];
  discover?: ExploreDiscoverPayload;
  reviews?: ExploreReviewPreviewRow[];
  /** Present when served from stale-first API cache. */
  fetched_at?: string;
};
