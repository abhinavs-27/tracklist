import { describe, it, expect, vi } from "vitest";
import { backfillLastfmScrobblesSince } from "@/lib/lastfm/backfill-scrobbles-since";

vi.mock("@/lib/lastfm/fetch-recent", () => ({
  fetchLastfmRecentTracksPageSafe: vi.fn().mockResolvedValue({
    ok: true,
    tracks: [],
    pageInfo: { page: 1, perPage: 100, totalPages: 1, total: 0 },
  }),
}));

vi.mock("@/lib/lastfm/ingest", () => ({
  ingestLastfmScrobbles: vi.fn().mockResolvedValue({ insertedLogs: 0, skipped: 0 }),
}));

const mockSupabase = {
  from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
} as any;

describe("backfillLastfmScrobblesSince onProgress", () => {
  it("calls onProgress callback when provided", async () => {
    const onProgress = vi.fn().mockResolvedValue(undefined);
    await backfillLastfmScrobblesSince(
      mockSupabase,
      "user-1",
      "someuser",
      "1970-01-01T00:00:00.000Z",
      { onProgress },
    );
    expect(onProgress).toBeDefined();
  });

  it("does not throw when onProgress is undefined", async () => {
    await expect(
      backfillLastfmScrobblesSince(
        mockSupabase,
        "user-1",
        "someuser",
        "1970-01-01T00:00:00.000Z",
      ),
    ).resolves.not.toThrow();
  });
});
