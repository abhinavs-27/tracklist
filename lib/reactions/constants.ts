/**
 * Likes are stored in `reactions.emoji` as this value (legacy rows may use other values).
 * Only this value is accepted for new writes.
 */
export const LIKE_REACTION_EMOJI = "❤️" as const;

export const REACTION_EMOJIS = [LIKE_REACTION_EMOJI] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const ALLOWED = new Set<string>(REACTION_EMOJIS);

export function isAllowedReactionEmoji(s: string): boolean {
  return ALLOWED.has(s);
}

/** Valid target_type values for writes (prevents arbitrary keys). */
export const REACTION_TARGET_TYPES = [
  "feed_review",
  "feed_follow",
  "feed_feed_story",
  "feed_listen_session",
  "feed_listen_sessions_summary",
  "notification_recommendation",
] as const;

export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

const ALLOWED_TYPES = new Set<string>(REACTION_TARGET_TYPES);

export function isAllowedReactionTargetType(t: string): t is ReactionTargetType {
  return ALLOWED_TYPES.has(t);
}
