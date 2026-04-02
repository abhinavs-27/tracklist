/** Chart week helpers: Sunday 00:00 UTC → next Sunday 00:00 UTC (half-open). */

export function utcSundayMidnightFromDate(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const utcMs = Date.UTC(y, m, day);
  const wd = new Date(utcMs).getUTCDay();
  const toSunday = -wd;
  return new Date(utcMs + toSunday * 86400000);
}

/**
 * The last completed chart week when cron runs on Sunday 00:00 UTC:
 * [weekStart, weekEndExclusive) = previous Sunday 00:00 UTC → this Sunday 00:00 UTC.
 */
export function getLastCompletedWeekWindow(now: Date): {
  weekStart: Date;
  weekEndExclusive: Date;
} {
  const thisSunday = utcSundayMidnightFromDate(now);
  const weekStart = new Date(thisSunday);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekEndExclusive = thisSunday;
  return { weekStart, weekEndExclusive };
}

export function previousWeekStartFrom(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() - 7);
  return d;
}
