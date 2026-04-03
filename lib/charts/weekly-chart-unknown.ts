import { isUnknownWeeklyChartEntityId } from "./weekly-chart-entity-guards";

export { isUnknownWeeklyChartEntityId };

/** Rows we never surface in the API/UI (synthetic or unresolved catalog). */
export function isUnknownWeeklyChartRow(r: {
  entity_id: string;
  name: string;
}): boolean {
  if (isUnknownWeeklyChartEntityId(r.entity_id)) return true;
  if (r.name.trim().startsWith("Unknown ")) return true;
  return false;
}
