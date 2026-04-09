import {
  SendMessageBatchCommand,
  type SendMessageBatchRequestEntry,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  getCommunityIdsWithLogsInRange,
  getUserIdsWithLogsInRange,
} from "@/lib/charts/billboard-week-participants";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import type { BillboardJobMessage } from "@/lib/jobs/types";

const SQS_BATCH = 10;
/** Pause between SQS batch requests to avoid flooding (ms). */
const PAUSE_MS_BETWEEN_BATCHES = 75;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getQueueUrl(): string {
  const url = process.env.BILLBOARD_JOBS_QUEUE_URL?.trim();
  if (!url) {
    throw new Error("Missing BILLBOARD_JOBS_QUEUE_URL");
  }
  return url;
}

async function sendBatches(
  client: SQSClient,
  entries: SendMessageBatchRequestEntry[],
): Promise<void> {
  for (let i = 0; i < entries.length; i += SQS_BATCH) {
    const batch = entries.slice(i, i + SQS_BATCH);
    const res = await client.send(
      new SendMessageBatchCommand({
        QueueUrl: getQueueUrl(),
        Entries: batch,
      }),
    );
    if (res.Failed && res.Failed.length > 0) {
      const msg = res.Failed.map((f) => `${f.Id}: ${f.Message}`).join("; ");
      throw new Error(`SQS SendMessageBatch partial failure: ${msg}`);
    }
    if (i + SQS_BATCH < entries.length) {
      await sleep(PAUSE_MS_BETWEEN_BATCHES);
    }
  }
}

/**
 * Enqueue one SQS message per user and per community for the chart week.
 * Uses the same “active” definitions as the legacy all-in-one cron: users/communities
 * with ≥1 listen in the completed window.
 */
export async function enqueueBillboardWeekJobs(options?: {
  weekStart?: Date;
  weekEndExclusive?: Date;
}): Promise<{
  weekStart: string;
  weekEndExclusive: string;
  userMessages: number;
  communityMessages: number;
}> {
  const window =
    options?.weekStart != null && options?.weekEndExclusive != null
      ? { weekStart: options.weekStart, weekEndExclusive: options.weekEndExclusive }
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();
  const weekToken = startIso;

  const [userIds, communityIds] = await Promise.all([
    getUserIdsWithLogsInRange(startIso, endIso),
    getCommunityIdsWithLogsInRange(startIso, endIso),
  ]);

  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const client = new SQSClient({ region });

  const userEntries: SendMessageBatchRequestEntry[] = userIds.map((userId, i) => {
    const body: BillboardJobMessage = {
      type: "GENERATE_USER_BILLBOARD",
      userId,
      week: weekToken,
    };
    return {
      Id: `u${i}`,
      MessageBody: JSON.stringify(body),
    };
  });

  const communityEntries: SendMessageBatchRequestEntry[] = communityIds.map(
    (communityId, i) => {
      const body: BillboardJobMessage = {
        type: "GENERATE_COMMUNITY_BILLBOARD",
        communityId,
        week: weekToken,
      };
      return {
        Id: `c${i}`,
        MessageBody: JSON.stringify(body),
      };
    },
  );

  await sendBatches(client, userEntries);
  if (communityEntries.length > 0) {
    await sleep(PAUSE_MS_BETWEEN_BATCHES);
  }
  await sendBatches(client, communityEntries);

  console.log("[enqueue-billboard-week]", {
    weekStart: startIso,
    userJobs: userEntries.length,
    communityJobs: communityEntries.length,
  });

  return {
    weekStart: startIso,
    weekEndExclusive: endIso,
    userMessages: userEntries.length,
    communityMessages: communityEntries.length,
  };
}
