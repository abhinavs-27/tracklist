import { sendCronJobMessage } from "@/lib/jobs/enqueue-cron-message";

/**
 * EventBridge monthly trigger: enqueue a SNAPSHOT_TASTE_MONTHLY cron job.
 *
 * Suggested EventBridge schedule: cron(0 2 2 * ? *)
 *   → 02:00 UTC on the 2nd of every month (previous month is always complete).
 *
 * Deploy:
 *   npm run build:lambda:taste-snapshot
 *   npm run package:lambda:taste-snapshot
 *   aws lambda update-function-code --function-name taste-snapshot-scheduler \
 *     --zip-file fileb:///tmp/taste-snapshot-scheduler.zip --region <REGION>
 */
export const handler = async () => {
  console.log("[taste-snapshot-scheduler] enqueuing SNAPSHOT_TASTE_MONTHLY");
  await sendCronJobMessage({ type: "SNAPSHOT_TASTE_MONTHLY" });
  console.log("[taste-snapshot-scheduler] enqueued");
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
