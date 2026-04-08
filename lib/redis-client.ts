import Redis from "ioredis";
import { attachRedisErrorHandler } from "./redis-error-handler";

/**
 * Single shared ioredis connection for HTTP response caches, discover keys, and the **main**
 * client passed to `Bottleneck.IORedisConnection` (Spotify limiters share one connection pair).
 *
 * `maxRetriesPerRequest: null` matches BullMQ / ioredis expectations for blocking commands.
 * BullMQ (`lib/jobs/spotifyQueue.ts`) still uses a **separate** connection so job polling does
 * not contend with app cache traffic on the same socket.
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
      maxRetriesPerRequest: null,
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
