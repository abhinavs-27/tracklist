export function formatWeeklyChartWeekLabel(
  weekStartIso: string,
  weekEndExclusiveIso: string,
): string {
  const start = new Date(weekStartIso);
  const endInclusive = new Date(
    new Date(weekEndExclusiveIso).getTime() - 1,
  );
  const sameMonth =
    start.getUTCMonth() === endInclusive.getUTCMonth() &&
    start.getUTCFullYear() === endInclusive.getUTCFullYear();
  const m = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const d = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
  const y = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });
  if (sameMonth) {
    return `${m.format(start)} ${d.format(start)}–${d.format(endInclusive)}, ${y.format(start)}`;
  }
  return `${m.format(start)} ${d.format(start)} – ${m.format(endInclusive)} ${d.format(endInclusive)}, ${y.format(endInclusive)}`;
}
