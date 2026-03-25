import type { FeedActivity } from "./types/feed";

export function feedItemKey(activity: FeedActivity, index: number): string {
  if (activity.type === "review") return `review-${activity.review.id}`;
  if (activity.type === "follow") return `follow-${activity.id}`;
  if (activity.type === "listen_sessions_summary") {
    return `summary-${activity.user_id}-${activity.created_at}`;
  }
  if (activity.type === "listen_session") {
    return `listen-${activity.user_id}-${activity.track_id}-${activity.created_at}`;
  }
  if (activity.type === "feed_story") {
    return `story-${activity.id}`;
  }
  return `feed-${index}`;
}
