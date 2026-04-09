import { enqueueBillboardWeekJobs } from "@/lib/jobs/enqueue-billboard-week";

/**
 * EventBridge / manual invoke: fan-out weekly billboard jobs to SQS.
 * Deploy as a separate Lambda from `dist/scheduler-handler.js` (not the SQS consumer).
 */
export const handler = async () => {
  const result = await enqueueBillboardWeekJobs();
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, ...result }),
  };
};
