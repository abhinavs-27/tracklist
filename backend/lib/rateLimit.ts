import type { Request } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

type Entry = { count: number; resetAt: number };

const discoverStore = new Map<string, Entry>();
const spotifyStore = new Map<string, Entry>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  const realIp = req.headers["x-real-ip"];
  const real = Array.isArray(realIp) ? realIp[0] : realIp;
  return first ?? real ?? req.socket.remoteAddress ?? "unknown";
}

function checkLimit(store: Map<string, Entry>, key: string): boolean {
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
  if (entry.count > MAX_REQUESTS) return false;
  return true;
}

/** 60 req/min per IP for discover routes. */
export function checkDiscoverRateLimit(req: Request): boolean {
  return checkLimit(discoverStore, `discover:${getClientIp(req)}`);
}

/** 60 req/min per IP for Spotify-backed routes. */
export function checkSpotifyRateLimit(req: Request): boolean {
  return checkLimit(spotifyStore, `spotify:${getClientIp(req)}`);
}
