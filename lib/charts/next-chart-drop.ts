import { utcSundayMidnightFromDate } from "@/lib/charts/utc-week";

/**
 * Next Sunday 00:00:00.000 UTC at or after `now` (weekly chart drop / ritual anchor).
 */
export function nextUtcSundayMidnightAfter(now: Date): Date {
  const curSunday = utcSundayMidnightFromDate(now);
  if (now.getTime() <= curSunday.getTime()) {
    return curSunday;
  }
  const n = new Date(curSunday);
  n.setUTCDate(n.getUTCDate() + 7);
  return n;
}
