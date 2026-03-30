/**
 * Likes (heart reactions on feed, inbox threads, notifications).
 *
 * Enable with `NEXT_PUBLIC_FEATURE_LIKES=1` in `.env.local`.
 */
export const LIKES_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_LIKES === "1";

export function isLikesEnabled(): boolean {
  return LIKES_ENABLED;
}
