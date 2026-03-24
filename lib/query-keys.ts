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
};
