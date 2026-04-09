import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import { runBillboardJob, runCronJob } from "@/lib/jobs/run-job";
import {
  parseBillboardJob,
  parseCronJob,
} from "@/workers/sqs-worker/src/parse-message";

const LOG = "[billboard-worker]";

function isCronQueue(record: SQSRecord): boolean {
  const arn = record.eventSourceARN ?? "";
  return arn.includes("tracklist-cron-jobs");
}

async function processRecord(record: SQSRecord): Promise<void> {
  const cron = isCronQueue(record);
  if (cron) {
    const job = parseCronJob(record.body);
    await runCronJob(job);
  } else {
    const job = parseBillboardJob(record.body);
    await runBillboardJob(job);
  }
}

/**
 * SQS-triggered worker only. Does not enqueue jobs — use `scheduler-entry.ts` for fan-out.
 */
export const handler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse | void> => {
  console.log("EVENT:", JSON.stringify(event));

  const records = event.Records ?? [];
  if (records.length === 0) {
    console.warn(LOG, "empty Records array");
    return;
  }

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of records) {
    console.log("RECORD BODY:", record.body);
    try {
      await processRecord(record);
    } catch (e) {
      console.error(LOG, "record failed", {
        messageId: record.messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  if (batchItemFailures.length > 0) {
    return { batchItemFailures };
  }
};
