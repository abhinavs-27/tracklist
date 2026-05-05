import { sendCronJobMessage } from "@/lib/jobs/enqueue-cron-message";

/**
 * EventBridge scheduled trigger: drains BullMQ enrich_artist / enrich_album
 * backlog to SQS so Lambda handles them without a persistent BullMQ worker.
 *
 * Suggested schedule: rate(1 hour) — keeps the backlog from growing stale.
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
