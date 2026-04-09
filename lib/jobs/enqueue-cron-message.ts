import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { CronJobMessage } from "@/lib/jobs/types";

export async function sendCronJobMessage(job: CronJobMessage): Promise<void> {
  const url = process.env.CRON_JOBS_QUEUE_URL?.trim();
  if (!url) {
    throw new Error("Missing CRON_JOBS_QUEUE_URL");
  }
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const client = new SQSClient({ region });
  await client.send(
    new SendMessageCommand({
      QueueUrl: url,
      MessageBody: JSON.stringify(job),
    }),
  );
}
