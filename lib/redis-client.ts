import Redis from "ioredis";
import { attachRedisErrorHandler } from "./redis-error-handler";

/**
 * Single shared ioredis connection for HTTP response caches and discover keys.
 * BullMQ (`lib/jobs/spotifyQueue.ts`) keeps its own connection with `maxRetriesPerRequest: null`.
 * Bottleneck passes `REDIS_URL` and manages its own clients.
 */
let sharedRedis: Redis | null | undefined;

export function getSharedRedis(): Redis | null {
  if (sharedRedis !== undefined) return sharedRedis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    sharedRedis = null;
    return null;
  }
  try {
    const r = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableReadyCheck: true,
    });
    attachRedisErrorHandler(r, "shared");
    sharedRedis = r;
  } catch {
    sharedRedis = null;
  }
  return sharedRedis;
}
