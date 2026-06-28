/**
 * Run the global taste-identity refresh (same work as the weekly cron):
 * refreshes users that are missing a cache or whose cache is stalest.
 *
 *   SPOTIFY_DISABLED=true REDIS_URL='' \
 *     NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     npx tsx scripts/run-taste-identity-refresh.ts
 *
 * SPOTIFY_DISABLED=true makes inline artwork enrichment fail-fast (uses DB data)
 * so the run doesn't stall on Spotify Dev-Mode timeouts. The no-clobber guard
 * (lib/taste/taste-identity-cache-write.ts) means a transient read failure can
 * never wipe a populated cache.
 */
import { runTasteIdentityRefresh } from "@/lib/cron/cron-runners";

async function main() {
  const result = await runTasteIdentityRefresh();
  console.log("taste-identity refresh:", JSON.stringify(result));
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
