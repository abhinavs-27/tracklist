/**
 * Session-scoped SWR helpers: instant paint on repeat visits while the API
 * revalidates in the background (pairs with `fetched_at` on JSON responses).
 */

const NS = "tracklist:swr:v1";

export function readStaleSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${NS}:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStaleSessionCache(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
