import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  enqueueSpotifyEnrich,
  getSpotifyEnrichQueue,
  processSpotifyEnrichJob,
  type SpotifyEnrichJobData,
} from "@/lib/jobs/spotifyQueue";
import { apiError, apiOk } from "@/lib/api-response";
import { syncListensSpotifyTrackIdsFromSongs } from "@/lib/lastfm/sync-listens-spotify-from-songs";

const BATCH_SONGS = 30;
const BATCH_ARTISTS = 20;

/**
 * Re-queues Spotify enrichment for catalog rows still marked pending.
 *
 * With `REDIS_URL`: jobs go to BullMQ (`spotify-enrich`) for a worker process.
 * **Without Redis**: runs each job inline in this request so local dev / no worker still completes work.
 *
 * First syncs `listens.spotify_track_id` from enriched `songs` rows (no Spotify API).
 */
export async function GET() {
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
        .limit(BATCH_SONGS),
      supabase
        .from("artists")
        .select("id, lastfm_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .limit(BATCH_ARTISTS),
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
      lfmSongId: s.id,
      artistName: s.lastfm_artist_name,
      trackName: s.lastfm_name,
      albumName: null,
    });
  }
  for (const a of artists ?? []) {
    if (!a.lastfm_name) continue;
    jobList.push({
      name: "resolve_artist_spotify",
      lfmArtistId: a.id,
      artistName: a.lastfm_name,
    });
  }

  const queue = getSpotifyEnrichQueue();
  const runMode: "redis" | "inline" = queue ? "redis" : "inline";
  let inlineCompleted = 0;
  let inlineFailed = 0;

  if (!queue) {
    for (const job of jobList) {
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
    jobs: jobList.length,
    queuedToRedis: queue ? jobList.length : undefined,
    processedInline: !queue ? inlineCompleted : undefined,
    failedInline: !queue ? inlineFailed : undefined,
    songSample: (songs ?? []).length,
    artistSample: (artists ?? []).length,
    listenSync,
  });
}
