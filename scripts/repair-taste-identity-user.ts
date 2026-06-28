/**
 * Recompute taste_identity_cache for one or more users.
 *
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     tsx scripts/repair-taste-identity-user.ts <userId> [<userId> ...]
 *
 * Use to repair a cache that was clobbered with an EMPTY payload (e.g. during a
 * transient DB incident). Safe to re-run; recomputes from current aggregates.
 */
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";

async function main() {
  const userIds = process.argv.slice(2).filter(Boolean);
  if (userIds.length === 0) {
    console.error("usage: repair-taste-identity-user.ts <userId> [<userId> ...]");
    process.exit(1);
  }

  for (const userId of userIds) {
    try {
      const result = await refreshTasteIdentityCacheForUser(userId);
      console.log(
        `done: ${userId} — totalLogs=${result.totalLogs} topArtists=${result.topArtists.length} topGenres=${result.topGenres.length} topAlbums=${result.topAlbums.length}`,
      );
    } catch (e) {
      console.error("failed:", userId, e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
  console.log("repair complete");
}

main();
