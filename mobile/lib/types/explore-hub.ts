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

/** Trimmed track from `?lite=true` Explore endpoints (no nested album/artists). */
export type ExploreHubTrackLite = {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
};

export type ExploreHubTrendingItem = {
  entity: TrendingEntity;
  track: ExploreHubTrackJson | ExploreHubTrackLite | null;
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
  user_id?: string;
  username: string;
  avatar_url?: string | null;
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

/** Matches `lib/explore-discovery-data` API JSON. */
export type ExploreMovement = {
  rank_delta: number | null;
  badge: "new" | "hot" | null;
};

export type ExploreDiscoveryTrackItem = {
  kind: "track";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
};

export type ExploreDiscoveryAlbumItem = {
  kind: "album";
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  href: string;
  movement: ExploreMovement;
  stat_label: string;
  review_snippet: string | null;
};

export type ExploreDiscoveryTalkedTrackItem = ExploreDiscoveryTrackItem & {
  review_snippet: string | null;
};

export type ExploreDiscoveryReviewEntityItem =
  | ExploreDiscoveryAlbumItem
  | ExploreDiscoveryTalkedTrackItem;

export type ExploreCommunityContrastRow = {
  community_id: string;
  community_name: string;
  top_track_id: string;
  top_track_name: string;
  top_track_image: string | null;
  href: string;
};

export type ExploreDiscoveryBundle = {
  range: "24h" | "week";
  blowing_up: ExploreDiscoveryTrackItem[];
  most_talked_about: ExploreDiscoveryReviewEntityItem[];
  most_loved: ExploreDiscoveryTrackItem[];
  hidden_gems: Array<ExploreDiscoveryTrackItem | ExploreDiscoveryAlbumItem>;
  across_communities: ExploreCommunityContrastRow[];
  fetched_at?: string;
};
