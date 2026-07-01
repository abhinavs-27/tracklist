import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────
const sendSpy = vi.fn(() => Promise.resolve({}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = sendSpy;
  },
  SendMessageCommand: class {
    constructor(public input: unknown) {}
  },
}));

let breakerOpen = false;
vi.mock("@/lib/spotify/client", () => ({
  checkCircuitBreaker: vi.fn(async () => {
    if (breakerOpen) {
      throw new Error("Spotify temporarily rate-limited (circuit breaker active)");
    }
  }),
}));

import {
  resolveEnrichmentQueueUrl,
  sendEnrichmentJobMessage,
} from "./enqueue-enrich-message";

const ENRICH = "https://sqs.us-east-2.amazonaws.com/1/tracklist-enrich-jobs";
const CRON = "https://sqs.us-east-2.amazonaws.com/1/tracklist-cron-jobs";

const orig = {
  enrich: process.env.ENRICH_JOBS_QUEUE_URL,
  cron: process.env.CRON_JOBS_QUEUE_URL,
  ak: process.env.AWS_ACCESS_KEY_ID,
  sk: process.env.AWS_SECRET_ACCESS_KEY,
};

afterEach(() => {
  process.env.ENRICH_JOBS_QUEUE_URL = orig.enrich;
  process.env.CRON_JOBS_QUEUE_URL = orig.cron;
  process.env.AWS_ACCESS_KEY_ID = orig.ak;
  process.env.AWS_SECRET_ACCESS_KEY = orig.sk;
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

describe("sendEnrichmentJobMessage circuit-breaker guard", () => {
  beforeEach(() => {
    sendSpy.mockClear();
    breakerOpen = false;
    process.env.ENRICH_JOBS_QUEUE_URL = ENRICH;
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
  });

  it("enqueues when the Spotify circuit breaker is closed", async () => {
    breakerOpen = false;
    await sendEnrichmentJobMessage({ type: "ENRICH_ARTIST", artistId: "a1" });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks bulk jobs (ENRICH_ARTIST) when the Spotify circuit breaker is open", async () => {
    breakerOpen = true;
    await sendEnrichmentJobMessage({ type: "ENRICH_ARTIST", artistId: "a1" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("allows SYNC_ARTIST_DISCOGRAPHY even when the Spotify circuit breaker is open (Deezer-based, on-demand)", async () => {
    breakerOpen = true;
    await sendEnrichmentJobMessage({ type: "SYNC_ARTIST_DISCOGRAPHY", artistId: "a1" });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
