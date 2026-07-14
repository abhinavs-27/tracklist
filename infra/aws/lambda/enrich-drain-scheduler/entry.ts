import { sendCronJobMessage } from "@/lib/jobs/enqueue-cron-message";

/**
 * EventBridge scheduled trigger: drains BullMQ enrich_artist / enrich_album
 * backlog to SQS so Lambda handles them without a persistent BullMQ worker.
 *
 * Suggested schedule: rate(1 day). (Was rate(1 hour) — it only services the Spotify
 * enrichment flood, so it should track the retry scheduler's cadence, now daily.)
 *
 * Deploy:
 *   npm run build:lambda:enrich-drain
 *   zip + aws lambda update-function-code --function-name enrich-drain-scheduler
 */
export const handler = async () => {
  console.log("[enrich-drain-scheduler] enqueuing DRAIN_ENRICH_BACKLOG");
  await sendCronJobMessage({ type: "DRAIN_ENRICH_BACKLOG" });
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
