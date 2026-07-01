import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { CronJobMessage } from "@/lib/jobs/types";

/**
 * Catalog-enrichment / Spotify-sync job types. These are routed to a DEDICATED
 * enrich queue (when configured) so a Spotify outage / rate-limit flood can't
 * back up the shared cron queue and starve scheduled jobs like the weekly
 * taste-identity refresh.
 */
type EnrichmentJobMessage = Extract<
  CronJobMessage,
  {
    type:
      | "ENRICH_ARTIST"
      | "ENRICH_ALBUM"
      | "SYNC_ARTIST_DISCOGRAPHY"
      | "SYNC_ALBUM_TRACKS";
  }
>;

type LegacyEnrichJobMessage = Extract<
  CronJobMessage,
  { type: "ENRICH_ARTIST" | "ENRICH_ALBUM" }
>;

/**
 * Pick the queue for enrichment work: the dedicated enrich queue when set,
 * otherwise fall back to the cron queue (preserves prior behavior when
 * ENRICH_JOBS_QUEUE_URL is not configured — so this is safe to ship before the
 * env var is rolled out). Returns null only if neither is configured.
 */
export function resolveEnrichmentQueueUrl(): string | null {
  return (
    process.env.ENRICH_JOBS_QUEUE_URL?.trim() ||
    process.env.CRON_JOBS_QUEUE_URL?.trim() ||
    null
  );
}

async function sendToQueue(url: string, job: CronJobMessage): Promise<void> {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

  // In Lambda the SDK uses the role's temporary credentials (with session token).
  // Outside Lambda pass explicit creds so stale shell env vars don't interfere.
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  let client: SQSClient;
  if (isLambda) {
    client = new SQSClient({ region });
  } else {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY");
    }
    client = new SQSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  }

  await client.send(
    new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(job) }),
  );
}

/**
 * Is Spotify's enrichment circuit breaker currently open? Only the breaker error
 * counts as "down" — an unrelated failure (import/Redis) must not block enqueues.
 */
async function isSpotifyEnrichmentCircuitOpen(): Promise<boolean> {
  try {
    const { checkCircuitBreaker } = await import("@/lib/spotify/client");
    await checkCircuitBreaker();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes("circuit breaker");
  }
}

/**
 * Enqueue a catalog-enrichment / Spotify-sync job onto the enrich queue
 * (falling back to the cron queue when ENRICH_JOBS_QUEUE_URL is unset).
 *
 * ENRICH_ARTIST / ENRICH_ALBUM are blocked while Spotify's circuit breaker is
 * open — during Dev-Mode 429 floods these are bulk jobs that dead-letter en
 * masse. SYNC_ARTIST_DISCOGRAPHY and SYNC_ALBUM_TRACKS are on-demand (page-view
 * triggered, one job per artist/album) so they are never blocked: dropping them
 * silently leaves artist pages with stale/missing albums indefinitely.
 */
export async function sendEnrichmentJobMessage(
  job: EnrichmentJobMessage,
): Promise<void> {
  const isBulkEnrichJob = job.type === "ENRICH_ARTIST" || job.type === "ENRICH_ALBUM";
  if (isBulkEnrichJob && await isSpotifyEnrichmentCircuitOpen()) {
    return;
  }
  const url = resolveEnrichmentQueueUrl();
  if (!url) {
    throw new Error("Missing ENRICH_JOBS_QUEUE_URL and CRON_JOBS_QUEUE_URL");
  }
  await sendToQueue(url, job);
}

/**
 * Legacy: send strictly to the dedicated enrich queue (no cron fallback).
 * Used by the DRAIN_ENRICH_BACKLOG cron that moves the BullMQ backlog to SQS.
 */
export async function sendEnrichJobMessage(
  job: LegacyEnrichJobMessage,
): Promise<void> {
  const url = process.env.ENRICH_JOBS_QUEUE_URL?.trim();
  if (!url) {
    throw new Error("Missing ENRICH_JOBS_QUEUE_URL");
  }
  await sendToQueue(url, job);
}
