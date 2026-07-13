import type { NotificationRow, NotificationType } from "./types/notifications";

type Actor = { username: string } | null;

const KNOWN_TYPES: readonly NotificationType[] = [
  "follow",
  "like",
  "review_like",
  "comment",
  "music_recommendation",
  "community_invite",
  "community_follow",
  "weekly_charts",
];

/** Primary line — aligned with web `/notifications` patterns. */
export function notificationPrimaryLine(
  n: NotificationRow,
  actor: Actor,
): string {
  const who = actor?.username ?? "Someone";
  if (!KNOWN_TYPES.includes(n.type as NotificationType)) {
    return humanizeNotificationType(n.type);
  }
  const type = n.type as NotificationType;
  switch (type) {
    case "follow":
      return `${who} started following you`;
    case "like":
      return `${who} liked your post`;
    case "review_like":
      return `${who} liked your review`;
    case "comment":
      return `${who} replied to you`;
    case "music_recommendation": {
      const p = n.payload as { title?: string } | undefined;
      return `${who} recommended ${p?.title?.trim() || "something"}`;
    }
    case "community_invite":
      return `${who} invited you to a community`;
    case "community_follow":
      return `${who} followed your community`;
    case "weekly_charts":
      return "Your weekly charts are ready";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** Secondary line — entity hint when we don’t resolve titles client-side. */
export function notificationSecondaryLine(n: NotificationRow): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  const et = n.entity_type.toLowerCase();
  if (et === "album") return "Album";
  if (et === "song") return "Track";
  if (et === "list") return "List";
  if (et === "community") return "Community";
  return null;
}

function humanizeNotificationType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
