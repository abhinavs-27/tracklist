/** Preset emoji for reaction bars (single source of truth for API + UI). */
export const REACTION_EMOJIS = ["❤️", "🔥", "👏", "💯", "🎵", "✨"] as const;

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
