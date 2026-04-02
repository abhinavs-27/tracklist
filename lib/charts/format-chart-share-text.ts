import type { ChartMomentPayload } from "@/lib/charts/weekly-chart-types";

/**
 * Plain-text summary for clipboard / Web Share API (matches share-card preview).
 */
export function formatWeeklyChartShareText(args: {
  chartKind: string;
  moment: ChartMomentPayload;
  /** When set, appended at the end (e.g. current page URL). */
  pageUrl?: string;
}): string {
  const { chartKind, moment, pageUrl } = args;
  const lines: string[] = [
    `Weekly Billboard · ${chartKind}`,
    moment.week_label,
    "",
  ];
  moment.top_5.forEach((r, i) => {
    const n = i + 1;
    const line = r.artist_name?.trim()
      ? `${n}. ${r.name} — ${r.artist_name}`
      : `${n}. ${r.name}`;
    lines.push(line);
  });
  if (moment.number_one) {
    lines.push("");
    lines.push(`Weeks at #1 (all-time): ${moment.number_one.weeks_at_1}`);
  }
  if (pageUrl?.trim()) {
    lines.push("");
    lines.push(pageUrl.trim());
  }
  return lines.join("\n");
}
