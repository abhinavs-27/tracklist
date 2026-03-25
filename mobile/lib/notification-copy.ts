import type { NotificationRow } from "./types/notifications";

type Actor = { username: string } | null;

/** Primary line — aligned with web `/notifications` patterns. */
export function notificationPrimaryLine(
  n: NotificationRow,
  actor: Actor,
): string {
  if (n.type === "follow") {
    return `${actor?.username ?? "Someone"} started following you`;
  }
  if (n.type === "community_invite") {
    return `${actor?.username ?? "Someone"} invited you to a community`;
  }
  return humanizeNotificationType(n.type);
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
