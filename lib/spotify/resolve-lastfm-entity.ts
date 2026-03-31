import "server-only";

import { after } from "next/server";
import { enqueueSpotifyEnrich, type SpotifyEnrichJobData } from "@/lib/jobs/spotifyQueue";
import { normalizeReviewEntityId } from "@/lib/validation";

const LOG_PREFIX = "[resolve-lastfm-entity]";
/** Short window: avoids double-fire from Strict Mode; still allows refresh retries. */
const DEDUPE_TTL_MS = 20 * 1000;

const recentEnqueueAt = new Map<string, number>();

function prune(now: number): void {
  if (recentEnqueueAt.size < 500) return;
  const cutoff = now - DEDUPE_TTL_MS;
  for (const [k, t] of recentEnqueueAt.entries()) {
    if (t < cutoff) recentEnqueueAt.delete(k);
  }
}

function shouldSkip(key: string, now: number): boolean {
  const prev = recentEnqueueAt.get(key);
  return prev != null && now - prev < DEDUPE_TTL_MS;
}

function resolveDebugEnabled(): boolean {
  return (
    process.env.LASTFM_RESOLVE_DEBUG === "1" ||
    process.env.SPOTIFY_DEBUG === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function resolveLog(msg: string, meta?: Record<string, unknown>): void {
  if (!resolveDebugEnabled()) return;
  if (meta && Object.keys(meta).length > 0) {
    console.log(`${LOG_PREFIX} ${msg}`, meta);
    return;
  }
  console.log(`${LOG_PREFIX} ${msg}`);
}

export type ResolveLastfmEntityInput =
  | {
      entity: "track";
      lfmSongId: string;
      trackName: string;
      artistName: string;
      albumName: string | null;
    }
  | {
      entity: "artist";
      lfmArtistId: string;
      artistName: string;
    };

function toJob(input: ResolveLastfmEntityInput): { key: string; job: SpotifyEnrichJobData } {
  if (input.entity === "track") {
    return {
      key: `track:${normalizeReviewEntityId(input.lfmSongId)}`,
      job: {
        name: "resolve_track_spotify",
        lfmSongId: normalizeReviewEntityId(input.lfmSongId),
        trackName: input.trackName.trim(),
        artistName: input.artistName.trim(),
        albumName: input.albumName?.trim() || null,
      },
    };
  }
  return {
    key: `artist:${normalizeReviewEntityId(input.lfmArtistId)}`,
    job: {
      name: "resolve_artist_spotify",
      lfmArtistId: normalizeReviewEntityId(input.lfmArtistId),
      artistName: input.artistName.trim(),
    },
  };
}

/**
 * Queue Last.fm → Spotify linking (track/artist; BullMQ or in-memory).
 * **Albums:** resolved synchronously in `getOrFetchAlbum` via `resolveSpotifyAlbumIdBySearch`.
 */
export function scheduleResolveSpotifyForLastfmEntity(
  input: ResolveLastfmEntityInput,
): void {
  const { key, job } = toJob(input);
  const now = Date.now();
  prune(now);
  if (shouldSkip(key, now)) {
    resolveLog("skip (dedupe ttl)", { key, job: job.name });
    return;
  }
  recentEnqueueAt.set(key, now);
  resolveLog("schedule", { key, job: job.name });
  const run = async () => {
    try {
      resolveLog("enqueue start", { key, job: job.name });
      await enqueueSpotifyEnrich(job);
      resolveLog("enqueue ok", { key, job: job.name });
    } catch (e) {
      console.warn(LOG_PREFIX, "enqueue failed", {
        key,
        job: job.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
  try {
    after(() => {
      resolveLog("after() callback", { key, job: job.name });
      void run();
    });
    resolveLog("registered after()", { key, job: job.name });
  } catch {
    resolveLog("after() unavailable; running immediately", {
      key,
      job: job.name,
    });
    void run();
  }
}
