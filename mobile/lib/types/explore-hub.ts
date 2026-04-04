import type { TrendingEntity } from "@repo/types";

/** Serialized Spotify track shape from `GET /api/explore` (JSON). */
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

export type ExploreHubResponse = {
  trending: ExploreHubTrendingItem[];
  leaderboard: ExploreHubLeaderboardEntry[];
};
