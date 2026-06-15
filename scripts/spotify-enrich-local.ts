/**
 * Cancel all pending BullMQ Spotify enrichment jobs and run enrichment locally (inline).
 *
 * Why: After a bulk Last.fm import, thousands of tracks need Spotify resolution.
 * Running this locally avoids saturating the AWS enrichment worker and lets you
 * use local compute + credentials for the heavy lifting.
 *
 * Usage:
 *   npm run spotify-enrich:local
 *
 * Options (env vars):
 *   BATCH_SONGS=200    tracks per round (default 200)
 *   BATCH_ARTISTS=100  artists per round (default 100)
 *   CLEAR_QUEUE=0      skip BullMQ queue obliterate step (default: obliterate if REDIS_URL set)
 *   DRY_RUN=1          print pending counts without processing
 */

import IORedis from "ioredis";
import { Queue } from "bullmq";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { processSpotifyEnrichJob } from "@/lib/jobs/spotifyQueue";
import { lfmArtistId, lfmSongId } from "@/lib/lastfm/lfm-ids";
import { syncListensSpotifyTrackIdsFromSongs } from "@/lib/lastfm/sync-listens-spotify-from-songs";

const BATCH_SONGS = Math.min(200, Math.max(1, parseInt(process.env.BATCH_SONGS ?? "200", 10)));
const BATCH_ARTISTS = Math.min(100, Math.max(1, parseInt(process.env.BATCH_ARTISTS ?? "100", 10)));
const DRY_RUN = process.env.DRY_RUN === "1";
const CLEAR_QUEUE = process.env.CLEAR_QUEUE !== "0";
const LOG = "[spotify-enrich-local]";

async function clearBullMQQueue(): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log(`${LOG} REDIS_URL not set — no queue to clear`);
    return;
  }

  // Use a standalone Redis connection, separate from the module-level cache in spotifyQueue.ts
  const redis = new IORedis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 5000,
  });
  try {
    await redis.connect();
    const queue = new Queue("spotify-enrich", { connection: redis });
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "paused",
    );
    console.log(`${LOG} queue counts before obliterate:`, counts);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      console.log(`${LOG} queue already empty`);
    } else {
      await queue.obliterate({ force: true });
      console.log(`${LOG} obliterated ${total} job(s) from queue`);
    }
    await queue.close();
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function main(): Promise<void> {
  const admin = createSupabaseAdminClient();

  if (DRY_RUN) {
    const [{ count: tracks }, { count: artists }] = await Promise.all([
      admin
        .from("tracks")
        .select("id", { count: "exact", head: true })
        .eq("needs_spotify_enrichment", true),
      admin
        .from("artists")
        .select("id", { count: "exact", head: true })
        .eq("needs_spotify_enrichment", true),
    ]);
    console.log(`${LOG} [dry] tracks pending: ${tracks ?? 0}, artists pending: ${artists ?? 0}`);
    process.exit(0);
  }

  // ── 1. Clear BullMQ queue (cancel existing worker jobs) ──────────────────────
  if (CLEAR_QUEUE) {
    console.log(`\n${LOG} === Step 1: Clear BullMQ queue ===`);
    await clearBullMQQueue();
  } else {
    console.log(`\n${LOG} === Step 1: Skipping queue clear (CLEAR_QUEUE=0) ===`);
  }

  // ── 2. Clear un-enrichable rows (no lastfm_name → Spotify can't resolve them) ─
  console.log(`\n${LOG} === Step 2: Clear un-enrichable rows ===`);
  const [tracksCleared, artistsCleared] = await Promise.all([
    admin
      .from("tracks")
      .update({ needs_spotify_enrichment: false }, { count: "exact" })
      .eq("needs_spotify_enrichment", true)
      .is("lastfm_name", null),
    admin
      .from("artists")
      .update({ needs_spotify_enrichment: false }, { count: "exact" })
      .eq("needs_spotify_enrichment", true)
      .is("lastfm_name", null),
  ]);
  console.log(
    `${LOG} cleared ${tracksCleared.count ?? 0} tracks and ${artistsCleared.count ?? 0} artists with no lastfm_name`,
  );

  // ── 3. Sync track→song Spotify IDs (marks already-known tracks as enriched) ──
  console.log(`\n${LOG} === Step 3: Sync track→song Spotify IDs ===`);
  await syncListensSpotifyTrackIdsFromSongs(admin, { limit: 2000 });
  console.log(`${LOG} sync complete`);

  // ── 4. Inline enrichment loop ─────────────────────────────────────────────────
  // Calls processSpotifyEnrichJob directly — bypasses BullMQ entirely.
  console.log(`\n${LOG} === Step 4: Inline enrichment loop (${BATCH_SONGS} songs / ${BATCH_ARTISTS} artists per round) ===`);

  let round = 0;
  let totalSongs = 0;
  let totalArtists = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  for (;;) {
    round++;

    const [{ data: tracks }, { data: artists }] = await Promise.all([
      admin
        .from("tracks")
        .select("id, lastfm_name, lastfm_artist_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .not("lastfm_artist_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(BATCH_SONGS),
      admin
        .from("artists")
        .select("id, lastfm_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(BATCH_ARTISTS),
    ]);

    const songCount = tracks?.length ?? 0;
    const artistCount = artists?.length ?? 0;

    if (songCount === 0 && artistCount === 0) {
      console.log(`${LOG} [round ${round}] nothing left to enrich — done!`);
      break;
    }

    console.log(
      `${LOG} [round ${round}] processing ${songCount} tracks + ${artistCount} artists...`,
    );

    let roundSongs = 0;
    let roundArtists = 0;
    let roundErrors = 0;

    for (let i = 0; i < (tracks ?? []).length; i++) {
      const t = tracks![i]!;
      if (!t.lastfm_name || !t.lastfm_artist_name) continue;
      const tStart = Date.now();
      try {
        await processSpotifyEnrichJob({
          name: "resolve_track_spotify",
          lfmSongId: lfmSongId(t.lastfm_artist_name, t.lastfm_name),
          artistName: t.lastfm_artist_name,
          trackName: t.lastfm_name,
          albumName: null,
        });
        roundSongs++;
        console.log(
          `${LOG}   track ${i + 1}/${songCount}: ${t.lastfm_artist_name} — ${t.lastfm_name} (${Date.now() - tStart}ms)`,
        );
      } catch (e) {
        roundErrors++;
        console.warn(
          `${LOG}   track ${i + 1}/${songCount} FAILED (${Date.now() - tStart}ms): ${t.lastfm_artist_name} — ${t.lastfm_name}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    for (let i = 0; i < (artists ?? []).length; i++) {
      const a = artists![i]!;
      if (!a.lastfm_name) continue;
      const aStart = Date.now();
      try {
        await processSpotifyEnrichJob({
          name: "resolve_artist_spotify",
          lfmArtistId: lfmArtistId(a.lastfm_name),
          artistName: a.lastfm_name,
        });
        roundArtists++;
        console.log(
          `${LOG}   artist ${i + 1}/${artistCount}: ${a.lastfm_name} (${Date.now() - aStart}ms)`,
        );
      } catch (e) {
        roundErrors++;
        console.warn(
          `${LOG}   artist ${i + 1}/${artistCount} FAILED (${Date.now() - aStart}ms): ${a.lastfm_name}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    totalSongs += roundSongs;
    totalArtists += roundArtists;
    totalErrors += roundErrors;

    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(
      `${LOG} [round ${round}] songs: ${roundSongs}/${songCount}, artists: ${roundArtists}/${artistCount}, errors: ${roundErrors}, total enriched: ${totalSongs} songs / ${totalArtists} artists, elapsed: ${elapsed}s`,
    );
  }

  const totalElapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${LOG} === Complete ===`);
  console.log(
    `${LOG} enriched ${totalSongs} tracks + ${totalArtists} artists across ${round - 1} round(s) in ${totalElapsed}s (${totalErrors} errors)`,
  );
}

main().catch((e) => {
  console.error(LOG, "fatal:", e);
  process.exit(1);
});
