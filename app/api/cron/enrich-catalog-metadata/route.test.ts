import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/cron/enrich-catalog-metadata", () => ({
  runDateEnrichmentBatch: vi.fn(),
  runTrackOrderEnrichmentBatch: vi.fn(),
}));

import { runDateEnrichmentBatch, runTrackOrderEnrichmentBatch } from "@/lib/cron/enrich-catalog-metadata";
import { GET } from "./route";

const mDate = runDateEnrichmentBatch as unknown as ReturnType<typeof vi.fn>;
const mTrack = runTrackOrderEnrichmentBatch as unknown as ReturnType<typeof vi.fn>;

function req(url: string, auth?: string): Request {
  return new Request(url, auth ? { headers: { authorization: auth } } : undefined);
}

beforeEach(() => {
  mDate.mockResolvedValue({ processed: 0, written: 0, noMatch: 0, errored: 0 });
  mTrack.mockResolvedValue({ processed: 0, written: 0, noSource: 0, noMatch: 0, errored: 0 });
});
afterEach(() => { vi.clearAllMocks(); delete process.env.CRON_SECRET; });

describe("GET /api/cron/enrich-catalog-metadata", () => {
  it("401s when CRON_SECRET is set and the bearer is wrong", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("https://x/api/cron/enrich-catalog-metadata", "Bearer nope"));
    expect(res.status).toBe(401);
    expect(mDate).not.toHaveBeenCalled();
  });

  it("runs both batches with parsed+capped limits and returns counts", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("https://x/api/cron/enrich-catalog-metadata?dates=10&tracks=99999", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(mDate).toHaveBeenCalledWith(expect.anything(), 10);
    expect(mTrack).toHaveBeenCalledWith(expect.anything(), 500); // capped at 500
    const body = await res.json();
    expect(body).toHaveProperty("dates");
    expect(body).toHaveProperty("tracks");
  });

  it("works with no CRON_SECRET set (open in local/dev)", async () => {
    const res = await GET(req("https://x/api/cron/enrich-catalog-metadata"));
    expect(res.status).toBe(200);
    expect(mDate).toHaveBeenCalledWith(expect.anything(), 150); // default
  });
});
