/**
 * Drain all pending logs into user_listening_aggregates in one shot.
 * Run after migration 173 resets the broken May data.
 *
 * Usage:
 *   npm run backfill:listening-aggregates
 */

import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "2000", 10);

async function main() {
  let totalProcessed = 0;
  let round = 0;

  for (;;) {
    round++;
    const { processed, errors } = await updateListeningAggregates({ batchSize: BATCH_SIZE });
    totalProcessed += processed;
    console.log(`[round ${round}] processed=${processed} errors=${errors} total=${totalProcessed}`);
    if (processed === 0) break;
  }

  console.log(`Done. ${totalProcessed} logs aggregated across ${round - 1} round(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
