/**
 * One-time backfill: enqueue SYNC_ARTIST_DISCOGRAPHY jobs for all artists
 * that have never had their discography synced (discography_synced_at IS NULL).
 *
 * Jobs are sent to SQS and processed in the background by the Lambda worker.
 * The Deezer + MusicBrainz rate limits are enforced inside the job handler —
 * this script just enqueues; it won't overwhelm anything by running fast.
 *
 * Usage (from repo root, with .env loaded):
 *   npm run backfill:artist-discography
 *
 * Or manually:
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     npx tsx scripts/backfill-artist-discography.ts
 *
 * Options (env vars):
 *   DRY_RUN=1          Print artist IDs/names but don't send to SQS.
 *   BATCH_SIZE=200      Artists per DB page (default 200).
 *   CONCURRENCY=20      Parallel SQS sends per batch (default 20).
 */

import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) Object.assign(globalThis, { WebSocket });

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendEnrichmentJobMessage } from "@/lib/jobs/enqueue-enrich-message";

const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "200", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "20", 10);

async function main() {
  const supabase = createSupabaseAdminClient();

  console.log(
    `[backfill:artist-discography] Starting${DRY_RUN ? " (DRY RUN)" : ""} — batch=${BATCH_SIZE} concurrency=${CONCURRENCY}`,
  );

  // Count total first so we can show progress
  const { count } = await supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .is("discography_synced_at", null);

  console.log(`[backfill:artist-discography] ${count ?? "?"} artists to process`);

  let lastId = "";
  let totalEnqueued = 0;
  let totalErrors = 0;
  let page = 0;

  for (;;) {
    // Keyset pagination by id (stable, no skips)
    let q = supabase
      .from("artists")
      .select("id, name")
      .is("discography_synced_at", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastId) q = q.gt("id", lastId);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    page++;
    const artists = data as { id: string; name: string }[];
    lastId = artists[artists.length - 1].id;

    if (DRY_RUN) {
      for (const a of artists) {
        console.log(`  [dry] ${a.id}  ${a.name}`);
      }
      totalEnqueued += artists.length;
      continue;
    }

    // Send in parallel up to CONCURRENCY at a time
    for (let i = 0; i < artists.length; i += CONCURRENCY) {
      const chunk = artists.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((a) =>
          sendEnrichmentJobMessage({ type: "SYNC_ARTIST_DISCOGRAPHY", artistId: a.id }),
        ),
      );
      for (const [j, r] of results.entries()) {
        if (r.status === "rejected") {
          console.error(`  [error] ${chunk[j].id} ${chunk[j].name}:`, r.reason);
          totalErrors++;
        } else {
          totalEnqueued++;
        }
      }
    }

    const pct = count ? Math.round((totalEnqueued / count) * 100) : "?";
    process.stdout.write(
      `\r[backfill:artist-discography] page ${page} — enqueued ${totalEnqueued}/${count ?? "?"} (${pct}%)  `,
    );
  }

  console.log(
    `\n[backfill:artist-discography] Done. enqueued=${totalEnqueued} errors=${totalErrors}`,
  );

  if (totalErrors > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[backfill:artist-discography] Fatal:", e);
  process.exit(1);
});
