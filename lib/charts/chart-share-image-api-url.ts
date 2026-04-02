import type { ChartType } from "@/lib/charts/weekly-chart-types";

/** Relative URL for the authenticated share-image endpoint. */
export function getChartShareImageApiUrl(args: {
  chartType: ChartType;
  weekStart: string | null;
}): string {
  const q = new URLSearchParams({ type: args.chartType });
  if (args.weekStart?.trim()) {
    q.set("weekStart", args.weekStart.trim());
  }
  return `/api/charts/share-image?${q.toString()}`;
}
