import type { FeedActivity } from "./types/feed";

export type ReactionTarget = { targetType: string; targetId: string };
export type CommentTarget = { targetType: "review" | "feed_item"; targetId: string };

/** Reaction target for a feed activity — mirrors web `feedActivityReactionTarget`. */
export function feedReactionTarget(activity: FeedActivity): ReactionTarget | null {
  switch (activity.type) {
    case "review":
      return { targetType: "feed_review", targetId: activity.review.id };
    case "follow":
      return { targetType: "feed_follow", targetId: activity.id };
    case "feed_story":
      return { targetType: "feed_feed_story", targetId: activity.id };
    case "listen_sessions_summary":
      return {
        targetType: "feed_listen_sessions_summary",
        targetId: `summary-${activity.user_id}-${activity.created_at}`,
      };
    case "listen_session":
      return {
        targetType: "feed_listen_session",
        targetId: `${activity.user_id}-${activity.album_id}-${activity.created_at}`,
      };
    default:
      return null;
  }
}

/** Comment target for a feed activity. */
export function feedCommentTarget(activity: FeedActivity): CommentTarget | null {
  switch (activity.type) {
    case "review":
      return { targetType: "review", targetId: activity.review.id };
    case "listen_session":
      return {
        targetType: "feed_item",
        targetId: `${activity.user_id}-${activity.album_id}-${activity.created_at}`,
      };
    case "listen_sessions_summary": {
      const first = activity.sessions[0];
      if (!first) return null;
      return {
        targetType: "feed_item",
        targetId: `${first.user_id}-${first.album_id}-${first.created_at}`,
      };
    }
    default:
      return null;
  }
}
