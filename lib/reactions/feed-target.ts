import type { EnrichedFeedActivity } from "@/components/feed/group-feed-items";
import type { FeedListenSessionActivity } from "@/components/feed/group-feed-items";

export function feedActivityReactionTarget(
  activity: EnrichedFeedActivity,
): { targetType: string; targetId: string } | null {
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

export function listenGroupReactionTarget(
  sessions: FeedListenSessionActivity[],
): { targetType: string; targetId: string } | null {
  const first = sessions[0];
  if (!first) return null;
  return {
    targetType: "feed_listen_session",
    targetId: `${first.user_id}-${first.album_id}-${first.created_at}`,
  };
}

export function feedRowReactionTarget(
  row:
    | { kind: "single"; activity: EnrichedFeedActivity }
    | { kind: "listen_group"; sessions: FeedListenSessionActivity[] },
): { targetType: string; targetId: string } | null {
  if (row.kind === "listen_group") {
    return listenGroupReactionTarget(row.sessions);
  }
  return feedActivityReactionTarget(row.activity);
}

/** User to target for Send rec / Compare taste (the actor of the activity). */
export function feedActivityEngagementUserId(
  activity: EnrichedFeedActivity,
): string | null {
  switch (activity.type) {
    case "review":
      return activity.review.user_id;
    case "follow":
      return activity.follower_id;
    case "feed_story":
      return activity.user?.id ?? null;
    case "listen_session":
      return activity.user_id;
    case "listen_sessions_summary":
      return activity.user_id;
    default:
      return null;
  }
}

export function listenGroupEngagementUserId(
  sessions: FeedListenSessionActivity[],
): string | null {
  return sessions[0]?.user_id ?? null;
}
