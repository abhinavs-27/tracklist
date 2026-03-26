import "server-only";

import {
  currentMonthStart,
  currentWeekStart,
  currentYear,
} from "@/lib/analytics/period-now";
import type { ReportRange } from "@/lib/analytics/getListeningReports";

/** Inclusive date bounds (YYYY-MM-DD) for the current preset period (UTC). */
export function periodBoundsForSave(
  range: Exclude<ReportRange, "custom">,
): { start: string; end: string } {
  if (range === "week") {
    const ws = currentWeekStart();
    const start = new Date(`${ws}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: ws, end: end.toISOString().slice(0, 10) };
  }
  if (range === "month") {
    const ms = currentMonthStart();
    const parts = ms.split("-");
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const end = new Date(Date.UTC(y, mo, 0));
    return { start: ms, end: end.toISOString().slice(0, 10) };
  }
  const y = currentYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
