import { NextRequest } from "next/server";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

function getKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
  return `spotify:${ip}`;
}

/**
 * Returns true if the request is within limit, false if rate limited.
 * Call this at the start of Spotify API route handlers (except connect/callback).
 * 60 requests per minute per IP.
 */
export function checkSpotifyRateLimit(request: NextRequest): boolean {
  const key = getKey(request);
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, entry);
    return true;
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return false;
  }
  return true;
}
