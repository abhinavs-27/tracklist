import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { CronJobMessage } from "@/lib/jobs/types";

type EnrichJobMessage = Extract<CronJobMessage, { type: "ENRICH_ARTIST" | "ENRICH_ALBUM" }>;

export async function sendEnrichJobMessage(job: EnrichJobMessage): Promise<void> {
  const url = process.env.ENRICH_JOBS_QUEUE_URL?.trim();
  if (!url) {
    throw new Error("Missing ENRICH_JOBS_QUEUE_URL");
  }
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

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
    new SendMessageCommand({
      QueueUrl: url,
      MessageBody: JSON.stringify(job),
    }),
  );
}
