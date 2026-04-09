/**
 * Long-running worker: polls SQS (billboard + cron queues), runs job handlers with rate limiting.
 * On success: delete message. On failure: leave message (visibility timeout → retry → DLQ after maxReceiveCount).
 */
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import Bottleneck from "bottleneck";
import { runBillboardJob, runCronJob } from "@/lib/jobs/run-job";
import { parseBillboardJob, parseCronJob } from "./parse-message";

const LOG = "[sqs-worker]";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const billboardUrl = process.env.BILLBOARD_JOBS_QUEUE_URL?.trim();
  const cronUrl = process.env.CRON_JOBS_QUEUE_URL?.trim();

  if (!billboardUrl && !cronUrl) {
    throw new Error(
      "Set BILLBOARD_JOBS_QUEUE_URL and/or CRON_JOBS_QUEUE_URL",
    );
  }

  const maxPerSec = Math.max(
    1,
    parseInt(process.env.WORKER_MAX_JOBS_PER_SEC ?? "8", 10) || 8,
  );
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: Math.ceil(1000 / maxPerSec),
  });

  const client = new SQSClient({ region });

  console.log(LOG, "started", {
    region,
    hasBillboard: Boolean(billboardUrl),
    hasCron: Boolean(cronUrl),
    maxPerSec,
  });

  for (;;) {
    try {
      let handled = false;

      if (billboardUrl) {
        const msg = await receiveOne(client, billboardUrl);
        if (msg) {
          handled = true;
          await limiter.schedule(() =>
            processBillboardMessage(client, billboardUrl, msg),
          );
        }
      }

      if (!handled && cronUrl) {
        const msg = await receiveOne(client, cronUrl);
        if (msg) {
          await limiter.schedule(() =>
            processCronMessage(client, cronUrl, msg),
          );
        }
      }

      if (!handled) {
        await sleep(500);
      }
    } catch (e) {
      console.error(LOG, "loop error", e);
      await sleep(2000);
    }
  }
}

type Msg = NonNullable<
  Awaited<ReturnType<typeof receiveOne>>
>;

async function receiveOne(
  client: SQSClient,
  queueUrl: string,
): Promise<{
  receiptHandle: string;
  body: string;
  receiveCount: number;
} | null> {
  const waitSec = Math.min(
    20,
    Math.max(0, parseInt(process.env.SQS_WAIT_TIME_SECONDS ?? "20", 10) || 20),
  );
  const visSec = Math.min(
    900,
    Math.max(
      60,
      parseInt(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS ?? "600", 10) || 600,
    ),
  );

  const res = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: waitSec,
      VisibilityTimeout: visSec,
      MessageSystemAttributeNames: ["ApproximateReceiveCount"],
    }),
  );

  const m = res.Messages?.[0];
  if (!m?.Body || !m.ReceiptHandle) return null;

  const receiveCount = parseInt(
    m.Attributes?.ApproximateReceiveCount ?? "1",
    10,
  );

  return {
    receiptHandle: m.ReceiptHandle,
    body: m.Body,
    receiveCount,
  };
}

async function processBillboardMessage(
  client: SQSClient,
  queueUrl: string,
  msg: Msg,
): Promise<void> {
  const job = parseBillboardJob(msg.body);
  console.log(LOG, "billboard job", {
    type: job.type,
    receiveCount: msg.receiveCount,
  });
  await runBillboardJob(job);
  await client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: msg.receiptHandle,
    }),
  );
}

async function processCronMessage(
  client: SQSClient,
  queueUrl: string,
  msg: Msg,
): Promise<void> {
  const job = parseCronJob(msg.body);
  console.log(LOG, "cron job", {
    type: job.type,
    receiveCount: msg.receiveCount,
  });
  await runCronJob(job);
  await client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: msg.receiptHandle,
    }),
  );
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
