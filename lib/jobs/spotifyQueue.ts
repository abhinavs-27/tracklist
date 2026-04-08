import "server-only";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { attachRedisErrorHandler } from "@/lib/redis-error-handler";
import { getArtist } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getSpotifyClientMetrics } from "@tracklist/spotify-client";

export type SpotifyEnrichJobData =
  | { name: "enrich_artist"; artistId: string }
  | { name: "enrich_album"; albumId: string }
  | { name: "enrich_track"; trackId: string }
  /** High-priority catalog fetch (e.g. user-facing); no secrets in payload. */
  | { name: "user_fetch"; trackId: string }
  | {
      name: "resolve_artist_spotify";
      lfmArtistId: string;
      artistName: string;
    }
  | {
      name: "resolve_track_spotify";
      lfmSongId: string;
      artistName: string;
      trackName: string;
      albumName: string | null;
    };

const QUEUE_NAME = "spotify-enrich";

/** Space Last.fm → Spotify resolve jobs so many imports in one sync do not burst the Spotify API. */
export function getSpotifyResolveStaggerMs(): number {
  const raw = process.env.SPOTIFY_RESOLVE_STAGGER_MS?.trim();
  if (!raw) return 2500;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 2500;
}

function resolveStaggerMs(): number {
  return getSpotifyResolveStaggerMs();
}

let redisConnection: IORedis | null | undefined;
let spotifyQueue: Queue | null | undefined;

function getRedisConnection(): IORedis | null {
  if (redisConnection !== undefined) return redisConnection;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisConnection = null;
    return null;
  }
  try {
    redisConnection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    attachRedisErrorHandler(redisConnection, "bullmq");
  } catch {
    redisConnection = null;
  }
  return redisConnection;
}

export function getSpotifyEnrichQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!spotifyQueue) {
    spotifyQueue = new Queue(QUEUE_NAME, { connection: conn });
  }
  return spotifyQueue;
}

/**
 * Enqueue catalog hydration (requires `REDIS_URL` + a running worker).
 * No-op when Redis is not configured — callers should fall back to direct cache reads.
 */
/** BullMQ: lower number = higher priority (see bullmq Job.priority). */
const PRIORITY_USER = 0;
/** Last.fm synthetic id resolution — ahead of generic catalog enrichment. */
const PRIORITY_LASTFM = 2;
const PRIORITY_BACKGROUND = 10;

function priorityForJob(job: SpotifyEnrichJobData): number {
  if (job.name === "user_fetch") return PRIORITY_USER;
  if (
    job.name === "resolve_artist_spotify" ||
    job.name === "resolve_track_spotify"
  ) {
    return PRIORITY_LASTFM;
  }
  return PRIORITY_BACKGROUND;
}

type EnrichQueueMetrics = {
  enqueued: number;
  processed: number;
  failed: number;
  dedupeHits: number;
  pendingEnrichments: number;
  dbFallbackHits: number;
  usingInMemoryQueue: boolean;
};

const inMemoryQueueUserFetch: SpotifyEnrichJobData[] = [];
const inMemoryQueueLastfm: SpotifyEnrichJobData[] = [];
const inMemoryQueueBackground: SpotifyEnrichJobData[] = [];
const inMemoryDedupe = new Set<string>();
let inMemoryProcessing = false;
let inMemoryWakeTimer: ReturnType<typeof setTimeout> | null = null;
const queueMetrics: EnrichQueueMetrics = {
  enqueued: 0,
  processed: 0,
  failed: 0,
  dedupeHits: 0,
  pendingEnrichments: 0,
  dbFallbackHits: 0,
  usingInMemoryQueue: false,
};

function jobKey(job: SpotifyEnrichJobData): string {
  switch (job.name) {
    case "enrich_artist":
      return `${job.name}:${job.artistId}`;
    case "enrich_album":
      return `${job.name}:${job.albumId}`;
    case "enrich_track":
    case "user_fetch":
      return `${job.name}:${job.trackId}`;
    case "resolve_artist_spotify":
      return `${job.name}:${job.lfmArtistId}`;
    case "resolve_track_spotify":
      return `${job.name}:${job.lfmSongId}`;
  }
}

function recalcPendingEnrichments(): void {
  queueMetrics.pendingEnrichments =
    inMemoryQueueUserFetch.length +
    inMemoryQueueLastfm.length +
    inMemoryQueueBackground.length;
}

function scheduleInMemoryProcessor(delayMs = 0): void {
  if (inMemoryWakeTimer) return;
  inMemoryWakeTimer = setTimeout(() => {
    inMemoryWakeTimer = null;
    void processInMemoryQueue();
  }, Math.max(0, delayMs));
}

function isLastfmResolveJob(job: SpotifyEnrichJobData): boolean {
  return (
    job.name === "resolve_track_spotify" || job.name === "resolve_artist_spotify"
  );
}

async function processInMemoryQueue(): Promise<void> {
  if (inMemoryProcessing) return;
  inMemoryProcessing = true;
  const gapMs = resolveStaggerMs();
  try {
    for (;;) {
      const next =
        inMemoryQueueUserFetch.shift() ??
        inMemoryQueueLastfm.shift() ??
        inMemoryQueueBackground.shift();
      if (!next) break;
      recalcPendingEnrichments();
      const key = jobKey(next);
      try {
        await processSpotifyEnrichJob(next);
        queueMetrics.processed += 1;
      } catch (e) {
        // Never throw to callers/UI; keep item flagged for future retries.
        queueMetrics.failed += 1;
        queueMetrics.dbFallbackHits += 1;
        if (process.env.NODE_ENV === "development") {
          console.warn("[spotify-queue] in-memory job failed; keeping system on DB fallback", {
            job: next,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        inMemoryDedupe.delete(key);
      }
      // Serverless in-memory queue drains in one invocation — pause between Spotify resolves.
      if (gapMs > 0 && isLastfmResolveJob(next)) {
        await new Promise((r) => setTimeout(r, gapMs));
      }
    }
  } finally {
    inMemoryProcessing = false;
    recalcPendingEnrichments();
    if (
      inMemoryQueueUserFetch.length > 0 ||
      inMemoryQueueLastfm.length > 0 ||
      inMemoryQueueBackground.length > 0
    ) {
      scheduleInMemoryProcessor(0);
    }
  }
}

async function enqueueInMemory(job: SpotifyEnrichJobData): Promise<void> {
  queueMetrics.usingInMemoryQueue = true;
  const key = jobKey(job);
  if (inMemoryDedupe.has(key)) {
    queueMetrics.dedupeHits += 1;
    return;
  }
  inMemoryDedupe.add(key);
  if (job.name === "user_fetch") inMemoryQueueUserFetch.push(job);
  else if (
    job.name === "resolve_artist_spotify" ||
    job.name === "resolve_track_spotify"
  ) {
    inMemoryQueueLastfm.push(job);
  } else {
    inMemoryQueueBackground.push(job);
  }
  queueMetrics.enqueued += 1;
  recalcPendingEnrichments();
  scheduleInMemoryProcessor(0);
}

export type EnqueueSpotifyEnrichOptions = {
  /**
   * Spread Last.fm resolve jobs in time (BullMQ `delay`). Index 0 → no delay, 1 → 1×stagger, etc.
   * Ignored for non–Last.fm-resolve jobs.
   */
  staggerIndex?: number;
};

export async function enqueueSpotifyEnrich(
  job: SpotifyEnrichJobData,
  options?: EnqueueSpotifyEnrichOptions,
): Promise<void> {
  const q = getSpotifyEnrichQueue();
  if (!q) {
    await enqueueInMemory(job);
    return;
  }
  const staggerMs = resolveStaggerMs();
  const staggerIndex = options?.staggerIndex;
  const delay =
    isLastfmResolveJob(job) &&
    typeof staggerIndex === "number" &&
    staggerIndex > 0
      ? staggerIndex * staggerMs
      : undefined;
  await q.add(job.name, job, {
    priority: priorityForJob(job),
    removeOnComplete: 500,
    removeOnFail: 200,
    ...(delay != null && delay > 0 ? { delay } : {}),
  });
}

/** Alias for hydration / enrichment queue (Spotify best-effort). */
export const enqueueHydration = enqueueSpotifyEnrich;

/**
 * Process one enrich job (call from a BullMQ Worker in a long-running process, not Vercel lambdas).
 */
export async function processSpotifyEnrichJob(
  job: SpotifyEnrichJobData,
): Promise<void> {
  if (job.name === "resolve_artist_spotify") {
    const { resolveArtistSpotifyJob } = await import(
      "@/lib/jobs/resolve-spotify-enrichment"
    );
    await resolveArtistSpotifyJob(job);
    return;
  }
  if (job.name === "resolve_track_spotify") {
    const { resolveTrackSpotifyJob } = await import(
      "@/lib/jobs/resolve-spotify-enrichment"
    );
    await resolveTrackSpotifyJob(job);
    return;
  }

  const { upsertArtistFromSpotify, getOrFetchAlbum, getOrFetchTrack } =
    await import("@/lib/spotify-cache");
  /** Admin client for worker/cron — no Next.js request cookies (see `createSpotifyEnrichWorker`). */
  const supabase = createSupabaseAdminClient();
  if (job.name === "enrich_artist") {
    const a = await getArtist(job.artistId, { allowClientCredentials: true });
    await upsertArtistFromSpotify(supabase, a);
    return;
  }
  if (job.name === "enrich_album") {
    await getOrFetchAlbum(job.albumId, { allowNetwork: true });
    return;
  }
  if (job.name === "enrich_track" || job.name === "user_fetch") {
    await getOrFetchTrack(job.trackId, { allowNetwork: true });
  }
}

/** Run in a long-lived Node process (not serverless). */
export function createSpotifyEnrichWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  return new Worker(
    QUEUE_NAME,
    async (bullJob) => {
      await processSpotifyEnrichJob(bullJob.data as SpotifyEnrichJobData);
    },
    { connection: conn, concurrency: 1 },
  );
}

export function getSpotifyEnrichMetrics(): Readonly<
  EnrichQueueMetrics & { spotifyClient: ReturnType<typeof getSpotifyClientMetrics> }
> {
  return {
    ...queueMetrics,
    pendingEnrichments:
      queueMetrics.usingInMemoryQueue
        ? inMemoryQueueUserFetch.length +
          inMemoryQueueLastfm.length +
          inMemoryQueueBackground.length
        : queueMetrics.pendingEnrichments,
    spotifyClient: getSpotifyClientMetrics(),
  };
}
