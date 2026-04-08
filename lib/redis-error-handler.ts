import type Redis from "ioredis";

/**
 * Subscribes to ioredis "error" so Node does not treat connection/auth failures as
 * unhandled rejections on the EventEmitter. Logs once per client on first error.
 */
export function attachRedisErrorHandler(client: Redis, label: string): void {
  let logged = false;
  client.on("error", (err: Error) => {
    if (logged) return;
    logged = true;
    const hint =
      err.message.includes("NOAUTH") || err.message.includes("Authentication")
        ? " Set REDIS_URL with the password from your host (e.g. redis://:PASSWORD@host:6379 or the full URL they provide for TLS)."
        : "";
    console.warn(`[redis:${label}] ${err.message}.${hint}`);
  });
}
