import type { ChartType } from "@/lib/charts/weekly-chart-types";

/** Relative URL for the authenticated share-image endpoint (personal or community billboard). */
export function getChartShareImageApiUrl(args: {
  chartType: ChartType;
  weekStart: string | null;
  /** When set, uses community weekly chart PNG (members only). */
  communityId?: string | null;
}): string {
  const q = new URLSearchParams({ type: args.chartType });
  if (args.weekStart?.trim()) {
    q.set("weekStart", args.weekStart.trim());
  }
  const cid = args.communityId?.trim();
  if (cid) {
    return `/api/communities/${encodeURIComponent(cid)}/charts/share-image?${q.toString()}`;
  }
  return `/api/charts/share-image?${q.toString()}`;
}
