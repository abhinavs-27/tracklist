// Client-safe (no "server-only"): shared by server notify() and category logic.

export type NotificationType =
  | "follow"
  | "like"
  | "review_like"
  | "comment"
  | "music_recommendation"
  | "community_invite"
  | "community_follow"
  | "weekly_charts";

export type NotificationCategory =
  | "social"
  | "recommendations"
  | "community"
  | "charts";

export const NOTIFICATION_CATEGORY: Record<
  NotificationType,
  NotificationCategory
> = {
  follow: "social",
  like: "social",
  review_like: "social",
  comment: "social",
  music_recommendation: "recommendations",
  community_invite: "community",
  community_follow: "community",
  weekly_charts: "charts",
};

export function categoryForType(type: NotificationType): NotificationCategory {
  return NOTIFICATION_CATEGORY[type];
}
