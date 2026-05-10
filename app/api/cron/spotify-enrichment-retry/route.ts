import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  enqueueSpotifyEnrich,
  getSpotifyEnrichQueue,
  getSpotifyResolveStaggerMs,
  processSpotifyEnrichJob,
  type SpotifyEnrichJobData,
} from "@/lib/jobs/spotifyQueue";
import { apiError, apiOk } from "@/lib/api-response";
import { lfmArtistId, lfmSongId } from "@/lib/lastfm/lfm-ids";
import { syncListensSpotifyTrackIdsFromSongs } from "@/lib/lastfm/sync-listens-spotify-from-songs";

const MAX_BATCH_SONGS = 200;
const MAX_BATCH_ARTISTS = 100;
const DEFAULT_BATCH_SONGS = 30;
const DEFAULT_BATCH_ARTISTS = 20;

/**
 * Re-queues Spotify enrichment for catalog rows still marked pending.
 *
 * With `REDIS_URL`: jobs go to BullMQ (`spotify-enrich`) for a worker process.
 * **Without Redis**: runs each job inline in this request so local dev / no worker still completes work.
 *
 * First syncs `listens.spotify_track_id` from enriched `songs` rows (no Spotify API).
 *
 * Query params:
 *   `batchSongs`   — max tracks to process per run (default 30, max 200)
 *   `batchArtists` — max artists to process per run (default 20, max 100)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const batchSongs = Math.min(
    MAX_BATCH_SONGS,
    Math.max(1, parseInt(searchParams.get("batchSongs") ?? String(DEFAULT_BATCH_SONGS), 10) || DEFAULT_BATCH_SONGS),
  );
  const batchArtists = Math.min(
    MAX_BATCH_ARTISTS,
    Math.max(1, parseInt(searchParams.get("batchArtists") ?? String(DEFAULT_BATCH_ARTISTS), 10) || DEFAULT_BATCH_ARTISTS),
  );

  const supabase = createSupabaseAdminClient();

  const listenSync = await syncListensSpotifyTrackIdsFromSongs(supabase, {
    limit: 800,
  });

  const [{ data: songs, error: songErr }, { data: artists, error: artistErr }] =
    await Promise.all([
      supabase
        .from("tracks")
        .select("id, lastfm_name, lastfm_artist_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .not("lastfm_artist_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(batchSongs),
      supabase
        .from("artists")
        .select("id, lastfm_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(batchArtists),
    ]);

  if (songErr || artistErr) {
    console.error("[cron spotify-enrichment-retry] query failed", songErr ?? artistErr);
    return apiError("query failed", 500);
  }

  const jobList: SpotifyEnrichJobData[] = [];
  for (const s of songs ?? []) {
    if (!s.lastfm_name || !s.lastfm_artist_name) continue;
    jobList.push({
      name: "resolve_track_spotify",
      lfmSongId: lfmSongId(s.lastfm_artist_name, s.lastfm_name),
      artistName: s.lastfm_artist_name,
      trackName: s.lastfm_name,
      albumName: null,
    });
  }
  for (const a of artists ?? []) {
    if (!a.lastfm_name) continue;
    jobList.push({
      name: "resolve_artist_spotify",
      lfmArtistId: lfmArtistId(a.lastfm_name),
      artistName: a.lastfm_name,
    });
  }

  const queue = getSpotifyEnrichQueue();
  const runMode: "redis" | "inline" = queue ? "redis" : "inline";
  let inlineCompleted = 0;
  let inlineFailed = 0;

  if (!queue) {
    const staggerMs = getSpotifyResolveStaggerMs();
    for (let i = 0; i < jobList.length; i++) {
      const job = jobList[i]!;
      try {
        await processSpotifyEnrichJob(job);
        inlineCompleted += 1;
      } catch (e) {
        inlineFailed += 1;
        console.warn("[cron spotify-enrichment-retry] inline job failed", {
          job: job.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      /** Same pacing as BullMQ delayed jobs / in-memory queue — avoids Spotify bursts when Redis is off. */
      if (staggerMs > 0 && i < jobList.length - 1) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }
    }
  } else {
    for (let i = 0; i < jobList.length; i++) {
      await enqueueSpotifyEnrich(jobList[i]!, { staggerIndex: i });
    }
  }

  console.log("[cron] spotify-enrichment-retry", {
    songs: (songs ?? []).length,
    artists: (artists ?? []).length,
    jobs: jobList.length,
    runMode,
    inlineCompleted,
    inlineFailed,
  });

  return apiOk({
    ok: true,
    runMode,
    batchSongs,
    batchArtists,
    jobs: jobList.length,
    queuedToRedis: queue ? jobList.length : undefined,
    processedInline: !queue ? inlineCompleted : undefined,
    failedInline: !queue ? inlineFailed : undefined,
    songSample: (songs ?? []).length,
    artistSample: (artists ?? []).length,
    listenSync,
  });
}
