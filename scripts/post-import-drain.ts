/**
 * Drain the full stats pipeline after a Last.fm bulk import.
 * Safe to run locally any time — idempotent, loops until empty.
 *
 * Usage:
 *   npm run post-import:drain
 *
 * Options:
 *   BATCH_SIZE=5000   — logs per updateListeningAggregates call (default 5000)
 *   DRY_RUN=1         — print pending count without processing
 */

import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";
import {
  repairMissingArtistAggregates,
  repairOrphanedArtistAggregates,
} from "@/lib/analytics/repair-artist-aggregates";
import { repairLfmAggregatesFromLogs } from "@/lib/analytics/repair-lfm-aggregates-from-logs";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { runSpotifyEnrichmentRetry } from "@/lib/cron/cron-runners";

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "5000", 10);
const DRY_RUN = process.env.DRY_RUN === "1";
const LOG = "[post-import-drain]";

async function drainAggregates(): Promise<number> {
  let total = 0;
  let round = 0;
  for (;;) {
    round++;
    const { processed, errors } = await updateListeningAggregates({ batchSize: BATCH_SIZE });
    total += processed;
    console.log(`${LOG} [agg round ${round}] processed=${processed} total=${total} errors=${errors}`);
    if (processed === 0) break;
    if (errors > 0) {
      console.error(`${LOG} aggregate error on round ${round} — stopping`);
      break;
    }
  }
  return total;
}

async function repairLfmAggregates(): Promise<void> {
  console.log(`${LOG} repairing missing artist/album/genre rows from processed logs...`);
  const r = await repairLfmAggregatesFromLogs();
  console.log(
    `${LOG} log-based repair done — artist: ${r.artistRows}, album: ${r.albumRows}, genre: ${r.genreRows}, errors: ${r.errors}`,
  );
}

async function repairArtistAggregates(): Promise<void> {
  console.log(`${LOG} secondary repair: artist rows from album aggregates + orphan cleanup...`);
  const [missing, orphaned] = await Promise.all([
    repairMissingArtistAggregates({ limit: 200000 }),
    repairOrphanedArtistAggregates(),
  ]);
  console.log(`${LOG} secondary repair done — missing inserted: ${missing.inserted}, orphaned merged: ${orphaned.merged}, errors: ${missing.errors + orphaned.errors}`);
}

async function refreshTasteForRecentImports(): Promise<void> {
  const admin = createSupabaseAdminClient();
  // Refresh all users who have completed a Last.fm import.
  // users has no updated_at — completion time is inside the lastfm_import_progress JSONB.
  // Taste refresh is cheap and idempotent so refreshing all done users is safe.
  const { data: users, error } = await admin
    .from("users")
    .select("id")
    .eq("lastfm_import_status", "done");

  if (error) {
    console.error(`${LOG} could not fetch recently-imported users:`, error.message);
    return;
  }

  const ids = (users ?? []).map((u) => u.id as string);
  console.log(`${LOG} refreshing taste identity for ${ids.length} recently-imported user(s)...`);

  for (const userId of ids) {
    try {
      await refreshTasteIdentityCacheForUser(userId);
      console.log(`${LOG}   taste identity refreshed for ${userId}`);
    } catch (e) {
      console.warn(`${LOG}   taste identity failed for ${userId}:`, e instanceof Error ? e.message : String(e));
    }
  }
}

async function main() {
  const t0 = Date.now();
  console.log(LOG, DRY_RUN ? "DRY RUN" : "starting full post-import drain...");
  console.log(LOG, `batch size: ${BATCH_SIZE}`);

  if (DRY_RUN) {
    const admin = createSupabaseAdminClient();
    const { data: wm } = await admin
      .from("aggregate_ingest_watermark")
      .select("last_processed_created_at")
      .maybeSingle();
    if (wm) {
      const { count } = await admin
        .from("logs")
        .select("id", { count: "exact", head: true })
        .gt("created_at", (wm as { last_processed_created_at: string }).last_processed_created_at);
      console.log(`${LOG} [dry] ~${count ?? "?"} logs pending aggregation`);
    }
    process.exit(0);
  }

  // 1. Drain aggregate queue
  console.log(`\n${LOG} === Step 1/5: Drain listening aggregates ===`);
  const aggregated = await drainAggregates();

  // 2. Back-fill artist/album/genre rows missing from logs processed before enrichment.
  //    This is the primary repair for Last.fm imports: the aggregate pipeline only wrote
  //    "track" rows when tracks had no artist_id/album_id. After `spotify-enrich:local`
  //    fills those fields, this step inserts the missing rows from the original log data.
  console.log(`\n${LOG} === Step 2/5: Repair missing artist/album/genre rows from logs ===`);
  await repairLfmAggregates();

  // 3. Secondary repair: infer any still-missing artist rows from album aggregate rows,
  //    and merge orphaned rows left by failed canonical merges.
  console.log(`\n${LOG} === Step 3/5: Secondary repair (artist from album + orphan cleanup) ===`);
  await repairArtistAggregates();

  // 4. Refresh taste identity for recently imported users
  console.log(`\n${LOG} === Step 4/5: Refresh taste identity ===`);
  await refreshTasteForRecentImports();

  // 5. Bump Spotify enrichment (kicks off next batch for un-enriched tracks)
  console.log(`\n${LOG} === Step 5/5: Spotify enrichment retry (200 songs / 100 artists) ===`);
  try {
    const result = await runSpotifyEnrichmentRetry(200, 100);
    console.log(`${LOG} enrichment queued — songs: ${result.songs}, artists: ${result.artists}`);
  } catch (e) {
    console.warn(`${LOG} enrichment retry failed (non-fatal):`, e instanceof Error ? e.message : String(e));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${LOG} done in ${elapsed}s — total aggregated: ${aggregated}`);
  console.log(`${LOG} Tip: run again until aggregated=0 to confirm the queue is fully drained.`);
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
