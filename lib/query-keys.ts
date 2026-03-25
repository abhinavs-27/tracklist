/** Centralized React Query keys (web + mobile) for invalidation. */

export const queryKeys = {
  /** Album detail (including tracks/stats/reviews when available). */
  album: (albumId: string) => ["album", albumId] as const,
  /** Song detail (composed from spotify + album + reviews; see useSong). */
  song: (songId: string) => ["song", songId] as const,
  /** Artist detail (Spotify + albums + top tracks; see useArtist). */
  artist: (artistId: string) => ["artist", artistId] as const,
  /** Use for all review queries; never use manual keys like ['reviews', ...]. */
  reviews: (entityType: string, entityId: string) =>
    ["reviews", entityType, entityId] as const,
  /** Prefix to invalidate all review queries (e.g. after liking a review). */
  reviewsPrefix: () => ["reviews"] as const,
  list: (listId: string) => ["list", listId] as const,
  listItems: (listId: string) => ["list", listId, "items"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  /** Lists created by a user (`GET /api/users/:userId/lists`). */
  userLists: (userId: string) => ["userLists", userId] as const,
  discover: () => ["discover"] as const,
  feed: () => ["feed"] as const,
  /** GET `/api/notifications` + actor enrichment. */
  notifications: () => ["notifications"] as const,
  favorites: (userId: string) => ["favorites", userId] as const,
  /** Leaderboard: type "popular" | "topRated" | "mostFavorited", filters { startYear?, endYear? }. */
  leaderboard: (
    type: string,
    filters: { startYear?: number; endYear?: number; entity?: string },
  ) => ["leaderboard", type, filters] as const,
  /** User listen logs (`GET /api/logs`) — invalidate after creating a log. */
  logs: () => ["logs"] as const,
  /** Computed taste summary (`GET /api/taste-identity`). */
  tasteIdentity: (userId: string) => ["tasteIdentity", userId] as const,
  /** Communities the signed-in user belongs to (`GET /api/communities`). */
  communitiesMine: () => ["communities", "mine"] as const,
  /** Single community metadata (`GET /api/communities/:id`). */
  community: (communityId: string) => ["community", communityId] as const,
  communityLeaderboard: (communityId: string) =>
    ["community", communityId, "leaderboard"] as const,
  communityFeed: (communityId: string) =>
    ["community", communityId, "feed"] as const,
  /** Group listening insights (`GET /api/communities/:id/insights`). */
  communityInsights: (communityId: string) =>
    ["community", communityId, "insights"] as const,
  /** User vs community taste vector (`GET /api/communities/:id/match`). */
  communityTasteMatch: (communityId: string) =>
    ["community", communityId, "tasteMatch"] as const,
  /** Similar users (`GET /api/taste/matches`). */
  tasteMatches: () => ["tasteMatches"] as const,
  /** Pending community invites for inbox (`GET /api/communities/invites`). */
  communityInvites: () => ["communityInvites"] as const,
  /** Recommended public communities (`GET /api/communities/recommended`). */
  recommendedCommunities: () => ["recommendedCommunities"] as const,
};
