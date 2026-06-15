import "server-only";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { attachRedisErrorHandler } from "@/lib/redis-error-handler";

export type LastfmFullImportJobData = {
  userId: string;
  lastfmUsername: string;
  fromIso: string;
};

const QUEUE_NAME = "lastfm-full-import";

let _redis: IORedis | null | undefined;
let _queue: Queue | null | undefined;

function getRedis(): IORedis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) { _redis = null; return null; }
  try {
    _redis = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true, connectTimeout: 3000 });
    attachRedisErrorHandler(_redis, "lastfm-bullmq");
  } catch { _redis = null; }
  return _redis;
}

export function getLastfmImportQueue(): Queue | null {
  const conn = getRedis();
  if (!conn) return null;
  if (!_queue) _queue = new Queue(QUEUE_NAME, { connection: conn });
  return _queue;
}

export async function enqueueLastfmFullImport(data: LastfmFullImportJobData): Promise<void> {
  const q = getLastfmImportQueue();
  if (!q) throw new Error("Redis not configured — cannot enqueue lastfm-full-import job");
  await q.add("full-import", data, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export function createLastfmImportWorker(
  processor: (job: LastfmFullImportJobData) => Promise<void>,
): Worker | null {
  const conn = getRedis();
  if (!conn) return null;
  return new Worker(
    QUEUE_NAME,
    async (bullJob) => processor(bullJob.data as LastfmFullImportJobData),
    { connection: conn, concurrency: 2 },
  );
}
