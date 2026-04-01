import "server-only";

import { listeningReportInclusiveBoundsForPreset } from "@/lib/analytics/listening-report-windows";
import type { ReportRange } from "@/lib/analytics/listening-report-types";

/** Inclusive date bounds (YYYY-MM-DD) for the current preset period (UTC). Delegates to listening report windows. */
export function periodBoundsForSave(
  range: Exclude<ReportRange, "custom">,
): { start: string; end: string } {
  return listeningReportInclusiveBoundsForPreset(range);
}
