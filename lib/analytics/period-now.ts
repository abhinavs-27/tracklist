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
