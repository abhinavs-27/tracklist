import "server-only";

import { after } from "next/server";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { attachRedisErrorHandler } from "@/lib/redis-error-handler";

export type MusicBrainzEnrichJobData =
  | { name: "enrich_artist"; artistId: string }
  | { name: "enrich_album"; albumId: string }
  | { name: "enrich_song"; songId: string };

const QUEUE_NAME = "musicbrainz-enrich";

let redisConnection: IORedis | null | undefined;
let mbQueue: Queue | null | undefined;

function getRedisConnection(): IORedis | null {
  if (redisConnection !== undefined) return redisConnection;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisConnection = null;
    return null;
  }
  try {
    redisConnection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true, connectTimeout: 3000 });
    attachRedisErrorHandler(redisConnection, "bullmq-mb");
  } catch {
    redisConnection = null;
  }
  return redisConnection;
}

export function getMusicBrainzQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!mbQueue) mbQueue = new Queue(QUEUE_NAME, { connection: conn });
  return mbQueue;
}

// ── In-memory fallback (no Redis) ─────────────────────────────────────────────
const inMemoryQueue: MusicBrainzEnrichJobData[] = [];
const inMemoryDedupe = new Set<string>();
let processing = false;

function jobKey(job: MusicBrainzEnrichJobData): string {
  if (job.name === "enrich_artist") return `enrich_artist:${job.artistId}`;
  if (job.name === "enrich_album") return `enrich_album:${job.albumId}`;
  return `enrich_song:${job.songId}`;
}

async function processInMemory(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (;;) {
      const next = inMemoryQueue.shift();
      if (!next) break;
      const key = jobKey(next);
      try {
        await processMusicBrainzJob(next);
      } catch {
        /* swallow */
      } finally {
        inMemoryDedupe.delete(key);
      }
    }
  } finally {
    processing = false;
  }
}

async function enqueueInMemory(job: MusicBrainzEnrichJobData): Promise<void> {
  const key = jobKey(job);
  if (inMemoryDedupe.has(key)) return;
  inMemoryDedupe.add(key);
  inMemoryQueue.push(job);
  try {
    after(() => {
      void processInMemory();
    });
  } catch {
    void processInMemory();
  }
}

export async function enqueueMusicBrainzEnrich(job: MusicBrainzEnrichJobData): Promise<void> {
  const q = getMusicBrainzQueue();
  if (!q) {
    await enqueueInMemory(job);
    return;
  }
  void q
    .add(job.name, job, { removeOnComplete: 200, removeOnFail: 100 })
    .catch((err) => console.error("[mb-queue] add failed", job.name, err));
}

export async function processMusicBrainzJob(job: MusicBrainzEnrichJobData): Promise<void> {
  if (job.name === "enrich_artist") {
    const { enrichArtist } = await import("@/lib/musicbrainz/enrich-artist");
    await enrichArtist(job.artistId);
    return;
  }
  if (job.name === "enrich_album") {
    const { enrichAlbum } = await import("@/lib/musicbrainz/enrich-album");
    await enrichAlbum(job.albumId);
    return;
  }
  if (job.name === "enrich_song") {
    const { enrichSong } = await import("@/lib/musicbrainz/enrich-song");
    await enrichSong(job.songId);
  }
}

export function createMusicBrainzWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  return new Worker(
    QUEUE_NAME,
    async (bullJob) => {
      await processMusicBrainzJob(bullJob.data as MusicBrainzEnrichJobData);
    },
    { connection: conn, concurrency: 1 },
  );
}
