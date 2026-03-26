/** UTC date helpers for listening aggregate buckets (aligned with DB timestamptz). */

export function utcWeekStartMonday(listenedAtIso: string): string {
  const d = new Date(listenedAtIso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const utcMs = Date.UTC(y, m, day);
  const wd = new Date(utcMs).getUTCDay();
  const toMonday = wd === 0 ? -6 : 1 - wd;
  return new Date(utcMs + toMonday * 86400000).toISOString().slice(0, 10);
}

export function utcMonthStart(listenedAtIso: string): string {
  const d = new Date(listenedAtIso);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  return `${y}-${String(mo).padStart(2, "0")}-01`;
}

export function utcYear(listenedAtIso: string): number {
  return new Date(listenedAtIso).getUTCFullYear();
}
