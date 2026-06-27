import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ __admin: true }) }));
vi.mock("@/lib/cron/enrich-catalog-metadata", () => ({
  runDateEnrichmentBatch: vi.fn(),
  runTrackOrderEnrichmentBatch: vi.fn(),
}));

import { runDateEnrichmentBatch, runTrackOrderEnrichmentBatch } from "@/lib/cron/enrich-catalog-metadata";
import { runEnrichCatalogMetadata } from "./cron-runners";

const mDate = runDateEnrichmentBatch as unknown as ReturnType<typeof vi.fn>;
const mTrack = runTrackOrderEnrichmentBatch as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("runEnrichCatalogMetadata", () => {
  it("runs both batches with defaults (150) and returns their counts", async () => {
    mDate.mockResolvedValue({ processed: 1, written: 1, noMatch: 0, errored: 0 });
    mTrack.mockResolvedValue({ processed: 2, written: 2, noSource: 0, noMatch: 0, errored: 0 });
    const res = await runEnrichCatalogMetadata();
    expect(mDate).toHaveBeenCalledWith({ __admin: true }, 150);
    expect(mTrack).toHaveBeenCalledWith({ __admin: true }, 150);
    expect(res.dates.written).toBe(1);
    expect(res.tracks.written).toBe(2);
  });

  it("honors explicit limits", async () => {
    mDate.mockResolvedValue({ processed: 0, written: 0, noMatch: 0, errored: 0 });
    mTrack.mockResolvedValue({ processed: 0, written: 0, noSource: 0, noMatch: 0, errored: 0 });
    await runEnrichCatalogMetadata({ dates: 10, tracks: 20 });
    expect(mDate).toHaveBeenCalledWith({ __admin: true }, 10);
    expect(mTrack).toHaveBeenCalledWith({ __admin: true }, 20);
  });
});
