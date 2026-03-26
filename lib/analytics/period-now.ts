import {
  utcMonthStart,
  utcWeekStartMonday,
  utcYear,
} from "@/lib/analytics/date-buckets";

export function currentWeekStart(): string {
  return utcWeekStartMonday(new Date().toISOString());
}

export function currentMonthStart(): string {
  return utcMonthStart(new Date().toISOString());
}

export function currentYear(): number {
  return utcYear(new Date().toISOString());
}

/** Previous ISO week (Monday) bucket, 7 days before `weekStart` (YYYY-MM-DD). */
export function previousWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** First day of the calendar month before `monthStart` (YYYY-MM-01). */
export function previousMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

export function previousCalendarYear(year: number): number {
  return year - 1;
}
