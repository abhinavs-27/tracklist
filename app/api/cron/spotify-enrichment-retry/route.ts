import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { apiError, apiOk } from "@/lib/api-response";

const BATCH_SONGS = 30;
const BATCH_ARTISTS = 20;

/**
 * Re-queues Spotify enrichment for catalog rows still marked pending.
 * Safe to run frequently; jobs no-op when Redis is unavailable.
 */
export async function GET() {
  const supabase = createSupabaseAdminClient();

  const [{ data: songs, error: songErr }, { data: artists, error: artistErr }] =
    await Promise.all([
      supabase
        .from("songs")
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

  let jobs = 0;
  for (const s of songs ?? []) {
    if (!s.lastfm_name || !s.lastfm_artist_name) continue;
    await enqueueSpotifyEnrich({
      name: "resolve_track_spotify",
      lfmSongId: s.id,
      artistName: s.lastfm_artist_name,
      trackName: s.lastfm_name,
      albumName: null,
    });
    jobs += 1;
  }
  for (const a of artists ?? []) {
    if (!a.lastfm_name) continue;
    await enqueueSpotifyEnrich({
      name: "resolve_artist_spotify",
      lfmArtistId: a.id,
      artistName: a.lastfm_name,
    });
    jobs += 1;
  }

  console.log("[cron] spotify-enrichment-retry", {
    songs: (songs ?? []).length,
    artists: (artists ?? []).length,
    jobs,
  });

  return apiOk({
    ok: true,
    queuedJobs: jobs,
    songSample: (songs ?? []).length,
    artistSample: (artists ?? []).length,
  });
}
