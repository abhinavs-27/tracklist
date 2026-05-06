import { getSharedRedis } from "@/lib/redis-client";

async function main() {
  const r = getSharedRedis();
  if (!r) { console.log("No Redis configured"); return; }
  const deleted = await r.del("spotify:circuit:blocked-until");
  console.log(deleted ? "Circuit breaker cleared" : "No circuit breaker was set");
  await r.quit();
}

main().catch(console.error);
