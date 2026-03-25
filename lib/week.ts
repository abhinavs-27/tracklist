/** UTC Monday 00:00:00 for the week containing `d` (ISO date string YYYY-MM-DD). */
export function getUtcWeekStartDate(d: Date = new Date()): string {
  const x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(x).getUTCDay(); // 0 Sun … 6 Sat
  const daysFromMonday = (day + 6) % 7;
  const mondayMs = x - daysFromMonday * 24 * 60 * 60 * 1000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}

/** ISO timestamps for the rolling last `days` days (for log queries). */
export function rollingWindowIso(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until: until.toISOString() };
}
