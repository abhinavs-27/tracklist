import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  enqueueSpotifyEnrich,
  getSpotifyEnrichQueue,
  getSpotifyResolveStaggerMs,
  processSpotifyEnrichJob,
  type SpotifyEnrichJobData,
} from "@/lib/jobs/spotifyQueue";
import { lfmArtistId, lfmSongId } from "@/lib/lastfm/lfm-ids";

/** PostgREST `.in()` is serialized into the URL; keep batches small to stay under ~16KB limits. */
const SUPABASE_IN_CHUNK = 80;

export type RepairLastfmCatalogSinceOptions = {
  /** Only logs for this user (optional). */
  userId?: string;
  /**
   * Max log rows to read this run (paginated, ordered). Stops early if fewer exist.
   * Use a high value to cover everyone; cap to avoid serverless timeouts.
   */
  logScanLimit: number;
  /** Max Spotify resolve jobs to enqueue this run. */
  maxJobs: number;
};

const LOG_PAGE_SIZE = 1000;

/**
 * Re-enqueue Last.fm → Spotify resolution for tracks/artists tied to logs on/after `sinceIso`.
 * Uses the same staggered queue as normal ingest so Spotify Bottleneck + job delay apply.
 */
export async function repairLastfmCatalogForLogsSince(
  supabase: SupabaseClient,
  sinceIso: string,
  options?: Partial<RepairLastfmCatalogSinceOptions>,
): Promise<{
  trackJobs: number;
  artistJobs: number;
  jobsEnqueued: number;
  runMode: "redis" | "inline";
  logRowsScanned: number;
  distinctTrackIds: number;
}> {
  const logScanLimit = Math.min(
    200_000,
    Math.max(500, options?.logScanLimit ?? 8000),
  );
  const maxJobs = Math.min(
    200,
    Math.max(1, options?.maxJobs ?? 40),
  );
  const userId = options?.userId?.trim() || undefined;

  const trackIdSet = new Set<string>();
  let logRowsScanned = 0;
  let offset = 0;

  for (;;) {
    let q = supabase
      .from("logs")
      .select("track_id")
      .eq("source", "lastfm")
      .gte("listened_at", sinceIso)
      .order("listened_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + LOG_PAGE_SIZE - 1);
    if (userId) q = q.eq("user_id", userId);

    const { data: logRows, error: logErr } = await q;

    if (logErr) {
      console.warn("[repair-lastfm-catalog] logs query failed", logErr);
      throw logErr;
    }

    const batch = logRows ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const tid = (row as { track_id: string }).track_id;
      if (tid) trackIdSet.add(tid);
    }
    logRowsScanned += batch.length;
    offset += batch.length;

    if (logRowsScanned >= logScanLimit) break;
    if (batch.length < LOG_PAGE_SIZE) break;
  }

  const trackIds = [...trackIdSet];
  if (trackIds.length === 0) {
    return {
      trackJobs: 0,
      artistJobs: 0,
      jobsEnqueued: 0,
      runMode: getSpotifyEnrichQueue() ? "redis" : "inline",
      logRowsScanned,
      distinctTrackIds: 0,
    };
  }

  type PendingTrack = {
    id: string;
    lastfm_name: string | null;
    lastfm_artist_name: string | null;
    album_id: string | null;
    artist_id: string | null;
  };

  const tracks: PendingTrack[] = [];

  for (let i = 0; i < trackIds.length; i += SUPABASE_IN_CHUNK) {
    const slice = trackIds.slice(i, i + SUPABASE_IN_CHUNK);
    const { data: chunk, error: trackErr } = await supabase
      .from("tracks")
      .select("id, lastfm_name, lastfm_artist_name, album_id, artist_id")
      .in("id", slice)
      .eq("needs_spotify_enrichment", true)
      .not("lastfm_name", "is", null)
      .not("lastfm_artist_name", "is", null);

    if (trackErr) {
      console.warn("[repair-lastfm-catalog] tracks query failed", trackErr);
      throw trackErr;
    }
    tracks.push(...((chunk ?? []) as PendingTrack[]));
  }

  const albumIds = [
    ...new Set(
      (tracks ?? [])
        .map((t) => t.album_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const albumNameById = new Map<string, string>();
  if (albumIds.length > 0) {
    for (let i = 0; i < albumIds.length; i += SUPABASE_IN_CHUNK) {
      const slice = albumIds.slice(i, i + SUPABASE_IN_CHUNK);
      const { data: albRows, error: albErr } = await supabase
        .from("albums")
        .select("id, name")
        .in("id", slice);
      if (albErr) {
        console.warn("[repair-lastfm-catalog] albums query failed", albErr);
        throw albErr;
      }
      for (const a of albRows ?? []) {
        const row = a as { id: string; name: string };
        albumNameById.set(row.id, row.name);
      }
    }
  }

  const trackJobList: SpotifyEnrichJobData[] = [];
  const seenSongKey = new Set<string>();

  for (const t of tracks ?? []) {
    const tn = t.lastfm_name?.trim();
    const an = t.lastfm_artist_name?.trim();
    if (!tn || !an) continue;
    const key = lfmSongId(an, tn);
    if (seenSongKey.has(key)) continue;
    seenSongKey.add(key);
    const albumName = t.album_id ? albumNameById.get(t.album_id) ?? null : null;
    trackJobList.push({
      name: "resolve_track_spotify",
      lfmSongId: key,
      artistName: an,
      trackName: tn,
      albumName,
    });
  }

  const artistIdsFromLogs = [
    ...new Set(
      (tracks ?? [])
        .map((t) => t.artist_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const artistJobList: SpotifyEnrichJobData[] = [];
  const seenArtistKey = new Set<string>();

  if (artistIdsFromLogs.length > 0) {
    type PendingArtist = { id: string; lastfm_name: string | null };
    const artistsAcc: PendingArtist[] = [];
    for (let i = 0; i < artistIdsFromLogs.length; i += SUPABASE_IN_CHUNK) {
      const slice = artistIdsFromLogs.slice(i, i + SUPABASE_IN_CHUNK);
      const { data: artists, error: artErr } = await supabase
        .from("artists")
        .select("id, lastfm_name")
        .in("id", slice)
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null);

      if (artErr) {
        console.warn("[repair-lastfm-catalog] artists query failed", artErr);
        throw artErr;
      }
      artistsAcc.push(...((artists ?? []) as PendingArtist[]));
    }

    for (const a of artistsAcc) {
      const name = a.lastfm_name?.trim();
      if (!name) continue;
      const key = lfmArtistId(name);
      if (seenArtistKey.has(key)) continue;
      seenArtistKey.add(key);
      artistJobList.push({
        name: "resolve_artist_spotify",
        lfmArtistId: key,
        artistName: name,
      });
    }
  }

  /** Artist resolves first — helps track matching when merges link Spotify ids. */
  const combined: SpotifyEnrichJobData[] = [
    ...artistJobList,
    ...trackJobList,
  ].slice(0, maxJobs);

  const queue = getSpotifyEnrichQueue();
  const runMode: "redis" | "inline" = queue ? "redis" : "inline";

  const staggerMs = getSpotifyResolveStaggerMs();

  if (!queue) {
    for (let i = 0; i < combined.length; i++) {
      try {
        await processSpotifyEnrichJob(combined[i]!);
      } catch (e) {
        console.warn("[repair-lastfm-catalog] inline job failed", {
          job: combined[i]?.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (i < combined.length - 1 && staggerMs > 0) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }
    }
  } else {
    for (let i = 0; i < combined.length; i++) {
      await enqueueSpotifyEnrich(combined[i]!, { staggerIndex: i });
    }
  }

  return {
    trackJobs: trackJobList.length,
    artistJobs: artistJobList.length,
    jobsEnqueued: combined.length,
    runMode,
    logRowsScanned,
    distinctTrackIds: trackIds.length,
  };
}
