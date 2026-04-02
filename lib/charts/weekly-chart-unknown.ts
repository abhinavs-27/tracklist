import {
  UNKNOWN_ALBUM_ENTITY,
  UNKNOWN_ARTIST_ENTITY,
  UNKNOWN_TRACK_ENTITY,
} from "@/lib/analytics/build-listening-report";

/** Synthetic / unresolved bucket ids (no `name` required). */
export function isUnknownWeeklyChartEntityId(entityId: string): boolean {
  return (
    entityId === UNKNOWN_TRACK_ENTITY ||
    entityId === UNKNOWN_ALBUM_ENTITY ||
    entityId === UNKNOWN_ARTIST_ENTITY ||
    entityId.startsWith("__tl_")
  );
}

/** Rows we never surface in the API/UI (synthetic or unresolved catalog). */
export function isUnknownWeeklyChartRow(r: {
  entity_id: string;
  name: string;
}): boolean {
  if (isUnknownWeeklyChartEntityId(r.entity_id)) return true;
  if (r.name.trim().startsWith("Unknown ")) return true;
  return false;
}
