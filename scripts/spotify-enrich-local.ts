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

// Swap to a dedicated enrichment Spotify app before any API calls are made.
// getClientCredentialsToken() reads SPOTIFY_CLIENT_ID at call time, so this works.
// Create a separate app at developer.spotify.com to avoid rate-limiting production.
if (process.env.SPOTIFY_ENRICH_CLIENT_ID) {
  process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_ENRICH_CLIENT_ID;
  process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_ENRICH_CLIENT_SECRET ?? "";
  console.log("[spotify-enrich-local] using dedicated enrichment Spotify app");
} else {
  console.warn(
    "[spotify-enrich-local] WARNING: SPOTIFY_ENRICH_CLIENT_ID not set — using production credentials.\n" +
    "  Create a separate Spotify app at developer.spotify.com and add:\n" +
    "  SPOTIFY_ENRICH_CLIENT_ID=...\n" +
    "  SPOTIFY_ENRICH_CLIENT_SECRET=...\n" +
    "  to .env.local to avoid rate-limiting the production app.",
  );
}

import IORedis from "ioredis";
import { Queue } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { getTrack } from "@/lib/spotify";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import {
  upsertTrackFromSpotify,
  upsertArtistFromSpotify,
  firstSpotifyImageUrl,
} from "@/lib/spotify-cache";
import { pickBestArtistMatch } from "@/lib/spotify/matching";
import { searchSpotify } from "@/lib/spotify";
import { syncListensSpotifyTrackIdsFromSongs } from "@/lib/lastfm/sync-listens-spotify-from-songs";

const BATCH_SONGS = Math.min(200, Math.max(1, parseInt(process.env.BATCH_SONGS ?? "200", 10)));
const BATCH_ARTISTS = Math.min(100, Math.max(1, parseInt(process.env.BATCH_ARTISTS ?? "100", 10)));
const DRY_RUN = process.env.DRY_RUN === "1";
const CLEAR_QUEUE = process.env.CLEAR_QUEUE !== "0";
const LOG = "[spotify-enrich-local]";
const DB_TIMEOUT_MS = 25_000; // abort any Supabase request stuck longer than this

/**
 * Admin client with a per-request fetch timeout so a locked DB row can't hang the script.
 * Each PostgREST HTTP call is aborted after DB_TIMEOUT_MS — the try/catch in the main loop
 * catches the AbortError and logs FAILED, then moves on to the next track.
 */
function createTimedAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false },
    // Node.js 20 has no native WebSocket; server scripts never use realtime subscriptions.
    realtime: {
      ...(typeof globalThis.WebSocket === "undefined"
        ? { transport: class {} as unknown as typeof WebSocket }
        : {}),
    },
    global: {
      fetch: (input, init) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);
        return fetch(input, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(id),
        );
      },
    },
  });
}

/**
 * Resolve a single LFM track to Spotify and fill in artist_id + album_id on the LFM row.
 * Deliberately skips mergeCanonicalTracks to avoid lock contention during bulk backfills.
 * The LFM UUID stays; the canonical merge runs later via the production enrichment worker.
 */
async function enrichTrack(
  admin: ReturnType<typeof createTimedAdminClient>,
  track: { id: string; lastfm_name: string; lastfm_artist_name: string },
): Promise<"enriched" | "no_match" | "skipped"> {
  const match = await mapLastfmToSpotify(track.lastfm_artist_name, track.lastfm_name, null);
  if (!match) {
    await admin.from("tracks").update({ needs_spotify_enrichment: false }).eq("id", track.id);
    return "no_match";
  }

  const spotifyTrack = await getTrack(match.trackId);
  const firstArtist = spotifyTrack.artists?.[0];
  const alb = spotifyTrack.album;
  if (!firstArtist || !alb) {
    await admin.from("tracks").update({ needs_spotify_enrichment: false }).eq("id", track.id);
    return "no_match";
  }

  // Create/update the Spotify-side canonical track (sets artist_id and album_id on that row).
  const spotifyTrackUuid = await upsertTrackFromSpotify(
    admin,
    spotifyTrack,
    alb.id,
    alb.name,
    firstSpotifyImageUrl(alb.images),
    "release_date" in alb ? (alb as { release_date?: string }).release_date : undefined,
  );

  // Copy artist_id and album_id from the Spotify canonical row back to the LFM row.
  const { data: canonical } = await admin
    .from("tracks")
    .select("artist_id, album_id")
    .eq("id", spotifyTrackUuid)
    .maybeSingle();

  await admin
    .from("tracks")
    .update({
      artist_id: (canonical as { artist_id?: string | null } | null)?.artist_id ?? null,
      album_id: (canonical as { album_id?: string | null } | null)?.album_id ?? null,
      needs_spotify_enrichment: false,
    })
    .eq("id", track.id);

  return "enriched";
}

/**
 * Resolve a single LFM artist to Spotify and clear the enrichment flag.
 * Skips mergeCanonicalArtists for the same reason as enrichTrack.
 */
async function enrichArtist(
  admin: ReturnType<typeof createTimedAdminClient>,
  artist: { id: string; lastfm_name: string },
): Promise<"enriched" | "no_match"> {
  const res = await searchSpotify(artist.lastfm_name, ["artist"], 5);
  const items = res.artists?.items ?? [];
  const pick = pickBestArtistMatch(artist.lastfm_name, items);

  if (!pick) {
    await admin.from("artists").update({ needs_spotify_enrichment: false }).eq("id", artist.id);
    return "no_match";
  }

  // Upsert the Spotify artist (fills genres/images/popularity).
  await upsertArtistFromSpotify(admin, pick);
  // Clear the enrichment flag on the LFM artist row.
  await admin.from("artists").update({ needs_spotify_enrichment: false }).eq("id", artist.id);
  return "enriched";
}

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
  const admin = createTimedAdminClient();

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
        const result = await enrichTrack(admin, t as { id: string; lastfm_name: string; lastfm_artist_name: string });
        roundSongs++;
        console.log(
          `${LOG}   track ${i + 1}/${songCount} [${result}]: ${t.lastfm_artist_name} — ${t.lastfm_name} (${Date.now() - tStart}ms)`,
        );
      } catch (e) {
        roundErrors++;
        console.warn(
          `${LOG}   track ${i + 1}/${songCount} FAILED (${Date.now() - tStart}ms): ${t.lastfm_artist_name} — ${t.lastfm_name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    for (let i = 0; i < (artists ?? []).length; i++) {
      const a = artists![i]!;
      if (!a.lastfm_name) continue;
      const aStart = Date.now();
      try {
        const result = await enrichArtist(admin, a as { id: string; lastfm_name: string });
        roundArtists++;
        console.log(
          `${LOG}   artist ${i + 1}/${artistCount} [${result}]: ${a.lastfm_name} (${Date.now() - aStart}ms)`,
        );
      } catch (e) {
        roundErrors++;
        console.warn(
          `${LOG}   artist ${i + 1}/${artistCount} FAILED (${Date.now() - aStart}ms): ${a.lastfm_name}: ${e instanceof Error ? e.message : String(e)}`,
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
