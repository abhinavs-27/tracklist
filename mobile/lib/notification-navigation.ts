import type { EnrichedNotification } from "./types/notifications";

/** In-app tap target — Expo path strings. */
export function getRouteForNotification(n: EnrichedNotification): string | null {
  if (n.type === "follow" && n.actor?.username) {
    return `/user/${encodeURIComponent(n.actor.username)}`;
  }
  if (n.entity_type === "album" && n.entity_id) {
    return `/album/${n.entity_id}`;
  }
  if (n.entity_type === "song" && n.entity_id) {
    return `/song/${n.entity_id}`;
  }
  if (n.entity_type === "list" && n.entity_id) {
    return `/list/${n.entity_id}`;
  }
  return null;
}
