/**
 * Client-safe entity id checks (no server-only imports).
 * Keep in sync with `lib/charts/weekly-chart-unknown.ts` / `build-listening-report` constants.
 */
const UNKNOWN_TRACK_ENTITY = "__tl_unknown_track__";
const UNKNOWN_ALBUM_ENTITY = "__tl_unknown_album__";
const UNKNOWN_ARTIST_ENTITY = "__tl_unknown_artist__";

export function isUnknownWeeklyChartEntityId(entityId: string): boolean {
  return (
    entityId === UNKNOWN_TRACK_ENTITY ||
    entityId === UNKNOWN_ALBUM_ENTITY ||
    entityId === UNKNOWN_ARTIST_ENTITY ||
    entityId.startsWith("__tl_")
  );
}
