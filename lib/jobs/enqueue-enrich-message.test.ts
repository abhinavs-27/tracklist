import { describe, it, expect, afterEach } from "vitest";

import { resolveEnrichmentQueueUrl } from "./enqueue-enrich-message";

const ENRICH = "https://sqs.us-east-2.amazonaws.com/1/tracklist-enrich-jobs";
const CRON = "https://sqs.us-east-2.amazonaws.com/1/tracklist-cron-jobs";

const orig = {
  enrich: process.env.ENRICH_JOBS_QUEUE_URL,
  cron: process.env.CRON_JOBS_QUEUE_URL,
};

afterEach(() => {
  process.env.ENRICH_JOBS_QUEUE_URL = orig.enrich;
  process.env.CRON_JOBS_QUEUE_URL = orig.cron;
});

describe("resolveEnrichmentQueueUrl", () => {
  it("prefers the dedicated enrich queue when set", () => {
    process.env.ENRICH_JOBS_QUEUE_URL = ENRICH;
    process.env.CRON_JOBS_QUEUE_URL = CRON;
    expect(resolveEnrichmentQueueUrl()).toBe(ENRICH);
  });

  it("falls back to the cron queue when enrich is unset (safe pre-rollout default)", () => {
    delete process.env.ENRICH_JOBS_QUEUE_URL;
    process.env.CRON_JOBS_QUEUE_URL = CRON;
    expect(resolveEnrichmentQueueUrl()).toBe(CRON);
  });

  it("falls back to the cron queue when enrich is blank", () => {
    process.env.ENRICH_JOBS_QUEUE_URL = "   ";
    process.env.CRON_JOBS_QUEUE_URL = CRON;
    expect(resolveEnrichmentQueueUrl()).toBe(CRON);
  });

  it("returns null when neither queue is configured", () => {
    delete process.env.ENRICH_JOBS_QUEUE_URL;
    delete process.env.CRON_JOBS_QUEUE_URL;
    expect(resolveEnrichmentQueueUrl()).toBeNull();
  });
});
