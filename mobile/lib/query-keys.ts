/** Centralized query keys for React Query invalidation. */

export const queryKeys = {
  /** Use for all review queries; never use manual keys like ['reviews', ...]. */
  reviews: (entityType: string, entityId: string) =>
    ["reviews", entityType, entityId] as const,
  /** Prefix to invalidate all review queries (e.g. after liking a review). */
  reviewsPrefix: () => ["reviews"] as const,
  list: (listId: string) => ["list", listId] as const,
  listItems: (listId: string) => ["list", listId, "items"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  discover: () => ["discover"] as const,
  feed: () => ["feed"] as const,
  favorites: (userId: string) => ["favorites", userId] as const,
  /** Leaderboard: type "popular" | "topRated" | "mostFavorited", filters { startYear?, endYear? }. */
  leaderboard: (
    type: string,
    filters: { startYear?: number; endYear?: number; entity?: string },
  ) =>
    ["leaderboard", type, filters] as const,
};

