import "server-only";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { getArtist } from "@/lib/spotify";
import { createSupabaseServerClient } from "@/lib/supabase-server";
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
/** BullMQ: 0 = highest priority (see bullmq Job.priority). */
const PRIORITY_USER = 0;
const PRIORITY_BACKGROUND = 10;

type EnrichQueueMetrics = {
  enqueued: number;
  processed: number;
  failed: number;
  dedupeHits: number;
  pendingEnrichments: number;
  dbFallbackHits: number;
  usingInMemoryQueue: boolean;
};

const inMemoryQueueHigh: SpotifyEnrichJobData[] = [];
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

function isHighPriorityJob(job: SpotifyEnrichJobData): boolean {
  return job.name === "user_fetch";
}

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
    inMemoryQueueHigh.length + inMemoryQueueBackground.length;
}

function scheduleInMemoryProcessor(delayMs = 0): void {
  if (inMemoryWakeTimer) return;
  inMemoryWakeTimer = setTimeout(() => {
    inMemoryWakeTimer = null;
    void processInMemoryQueue();
  }, Math.max(0, delayMs));
}

async function processInMemoryQueue(): Promise<void> {
  if (inMemoryProcessing) return;
  inMemoryProcessing = true;
  try {
    for (;;) {
      const next = inMemoryQueueHigh.shift() ?? inMemoryQueueBackground.shift();
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
    }
  } finally {
    inMemoryProcessing = false;
    recalcPendingEnrichments();
    if (inMemoryQueueHigh.length > 0 || inMemoryQueueBackground.length > 0) {
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
  if (isHighPriorityJob(job)) inMemoryQueueHigh.push(job);
  else inMemoryQueueBackground.push(job);
  queueMetrics.enqueued += 1;
  recalcPendingEnrichments();
  scheduleInMemoryProcessor(0);
}

export async function enqueueSpotifyEnrich(
  job: SpotifyEnrichJobData,
): Promise<void> {
  const q = getSpotifyEnrichQueue();
  if (!q) {
    await enqueueInMemory(job);
    return;
  }
  const priority = job.name === "user_fetch" ? PRIORITY_USER : PRIORITY_BACKGROUND;
  await q.add(job.name, job, {
    priority,
    removeOnComplete: 500,
    removeOnFail: 200,
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
  const supabase = await createSupabaseServerClient();
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
        ? inMemoryQueueHigh.length + inMemoryQueueBackground.length
        : queueMetrics.pendingEnrichments,
    spotifyClient: getSpotifyClientMetrics(),
  };
}
