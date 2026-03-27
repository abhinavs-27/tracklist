import "server-only";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { getArtist } from "@/lib/spotify";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type SpotifyEnrichJobData =
  | { name: "enrich_artist"; artistId: string }
  | { name: "enrich_album"; albumId: string }
  | { name: "enrich_track"; trackId: string }
  /** High-priority catalog fetch (e.g. user-facing); no secrets in payload. */
  | { name: "user_fetch"; trackId: string };

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

export async function enqueueSpotifyEnrich(
  job: SpotifyEnrichJobData,
): Promise<void> {
  const q = getSpotifyEnrichQueue();
  if (!q) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[spotify-queue] REDIS_URL missing; enrich job dropped", job);
    }
    return;
  }
  const priority = job.name === "user_fetch" ? PRIORITY_USER : PRIORITY_BACKGROUND;
  await q.add(job.name, job, {
    priority,
    removeOnComplete: 500,
    removeOnFail: 200,
  });
}

/**
 * Process one enrich job (call from a BullMQ Worker in a long-running process, not Vercel lambdas).
 */
export async function processSpotifyEnrichJob(
  job: SpotifyEnrichJobData,
): Promise<void> {
  const { upsertArtistFromSpotify, getOrFetchAlbum, getOrFetchTrack } =
    await import("@/lib/spotify-cache");
  const supabase = await createSupabaseServerClient();
  if (job.name === "enrich_artist") {
    const a = await getArtist(job.artistId, { allowClientCredentials: true });
    await upsertArtistFromSpotify(supabase, a);
    return;
  }
  if (job.name === "enrich_album") {
    await getOrFetchAlbum(job.albumId);
    return;
  }
  if (job.name === "enrich_track" || job.name === "user_fetch") {
    await getOrFetchTrack(job.trackId);
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
