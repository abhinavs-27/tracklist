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
  if (n.type === "community_invite" && n.entity_type === "community" && n.entity_id) {
    return `/communities/${encodeURIComponent(n.entity_id)}`;
  }
  if (n.type === "music_recommendation" && n.entity_type === "artist" && n.entity_id) {
    return `/artist/${n.entity_id}`;
  }
  if (n.type === "music_recommendation" && n.entity_type === "album" && n.entity_id) {
    return `/album/${n.entity_id}`;
  }
  if (n.type === "music_recommendation" && n.entity_type === "track" && n.entity_id) {
    const p = n.payload as { albumId?: string } | undefined;
    if (p?.albumId?.trim()) return `/album/${p.albumId.trim()}`;
    return null;
  }
  return null;
}
