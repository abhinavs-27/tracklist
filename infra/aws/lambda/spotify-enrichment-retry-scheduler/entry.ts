import { sendCronJobMessage } from "@/lib/jobs/enqueue-cron-message";

/**
 * EventBridge scheduled trigger: re-queues Spotify enrichment for catalog rows
 * still marked needs_spotify_enrichment = true.
 *
 * Suggested schedule: rate(30 minutes)
 *
 * Deploy:
 *   npm run build:lambda:spotify-enrichment-retry
 *   zip + aws lambda update-function-code --function-name spotify-enrichment-retry-scheduler
 */
export const handler = async () => {
  console.log("[spotify-enrichment-retry-scheduler] enqueuing SPOTIFY_ENRICHMENT_RETRY");
  await sendCronJobMessage({ type: "SPOTIFY_ENRICHMENT_RETRY" });
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
