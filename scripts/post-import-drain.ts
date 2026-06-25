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
import { repairLfmAggregatesChunked } from "@/lib/analytics/repair-lfm-aggregates-chunked";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { runSpotifyEnrichmentRetry } from "@/lib/cron/cron-runners";
import { resolveTrackArtistIdsByName } from "@/lib/analytics/resolve-track-artist-ids";

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

async function resolveTrackArtists(): Promise<void> {
  console.log(`${LOG} resolving tracks.artist_id from lastfm_artist_name via catalog name lookup...`);
  const r = await resolveTrackArtistIdsByName();
  console.log(
    `${LOG} artist_id resolution done — tracks updated: ${r.tracksUpdated}, errors: ${r.errors}`,
  );
}

async function getLfmImportedUsers(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id")
    .in("lastfm_import_status", ["done", "running"]);
  if (error) {
    console.error(`${LOG} could not fetch imported users:`, error.message);
    return [];
  }
  return (data ?? []).map((u) => u.id as string);
}

async function repairLfmAggregates(): Promise<void> {
  // Chunked cursor-based repair: processes 5000 ingest rows per RPC call, each
  // well within the 2-minute PostgREST timeout. Loops until next_cursor is null.
  console.log(`${LOG} repairing missing artist/album/genre rows (chunked, 5k rows/call)...`);
  const r = await repairLfmAggregatesChunked({ chunkSize: 5000 });
  console.log(
    `${LOG} log-based repair done — artist: ${r.artistRows}, album: ${r.albumRows}, genre: ${r.genreRows}, chunks: ${r.chunks}, errors: ${r.errors}`,
  );
}

async function repairArtistAggregates(userIds: string[]): Promise<void> {
  // Per-user, best-effort. These functions scan user_listening_aggregates and may
  // timeout for users with very large histories (>100k aggregate rows). That's
  // acceptable — repair_lfm_aggregates_chunk handles the primary repair; this step
  // is a secondary safety net for edge cases (album agg exists but artist agg dropped).
  let totalInserted = 0, totalMerged = 0;
  for (const userId of userIds) {
    const [missing, orphaned] = await Promise.all([
      repairMissingArtistAggregates({ userId }),
      repairOrphanedArtistAggregates({ userId }),
    ]);
    totalInserted += missing.inserted;
    totalMerged += orphaned.merged;
    if (missing.inserted + orphaned.merged > 0) {
      console.log(`${LOG}   user ${userId}: missing=${missing.inserted} orphaned=${orphaned.merged}`);
    }
    // Timeout errors for large users are non-fatal — log at debug level and continue.
    if (missing.errors + orphaned.errors > 0) {
      console.log(`${LOG}   user ${userId}: secondary repair skipped (user too large for timeout window)`);
    }
  }
  console.log(`${LOG} secondary repair done — missing inserted: ${totalInserted}, orphaned merged: ${totalMerged}`);
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
  console.log(`\n${LOG} === Step 1/6: Drain listening aggregates ===`);
  const aggregated = await drainAggregates();

  // 2. Resolve tracks.artist_id from lastfm_artist_name — no Spotify call needed.
  //    Most artists from a Last.fm import already exist in the catalog (other users' history).
  //    This fills in artist_id so the repair step can find artist/genre aggregate rows.
  console.log(`\n${LOG} === Step 2/6: Resolve track artist_id by name ===`);
  await resolveTrackArtists();

  // 3. Back-fill artist/album/genre rows missing from logs processed before enrichment.
  //    repair_lfm_aggregates_from_logs now also has a name-join fallback for any tracks
  //    still null after the resolve step above.
  console.log(`\n${LOG} === Step 3/6: Repair missing artist/album/genre rows from logs ===`);
  await repairLfmAggregates();

  // 4. Secondary repair: infer any still-missing artist rows from album aggregate rows,
  //    and merge orphaned rows left by failed canonical merges.
  // Fetch the user list for the per-user secondary repair (these functions scan aggregates,
  // not the ingest table, so per-user scoping is effective here).
  const importedUsers = await getLfmImportedUsers();
  console.log(`${LOG} ${importedUsers.length} Last.fm-imported user(s) for secondary repair`);
  console.log(`\n${LOG} === Step 4/6: Secondary repair (artist from album + orphan cleanup) ===`);
  await repairArtistAggregates(importedUsers);

  // 5. Refresh taste identity for recently imported users
  console.log(`\n${LOG} === Step 5/6: Refresh taste identity ===`);
  await refreshTasteForRecentImports();

  // 6. Bump Spotify enrichment (kicks off next batch for un-enriched tracks)
  console.log(`\n${LOG} === Step 6/6: Spotify enrichment retry (200 songs / 100 artists) ===`);
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
