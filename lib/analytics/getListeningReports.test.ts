import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// Track buildListeningReport call count
let buildCallCount = 0;

vi.mock("@/lib/analytics/build-listening-report", () => ({
  buildListeningReport: vi.fn(async () => {
    buildCallCount++;
    return {
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      totalPlays: 10,
      byEntity: {
        track: [{ entity_id: "t1", count: 5 }, { entity_id: "t2", count: 5 }],
        album: [{ entity_id: "a1", count: 10 }],
        artist: [{ entity_id: "ar1", count: 10 }, { entity_id: "ar2", count: 5 }],
        genre: [{ entity_id: "pop", count: 10 }],
      },
    };
  }),
  UNKNOWN_TRACK_ENTITY: "__tl_unknown_track__",
  UNKNOWN_ALBUM_ENTITY: "__tl_unknown_album__",
  UNKNOWN_ARTIST_ENTITY: "__tl_unknown_artist__",
}));

vi.mock("@/lib/spotify-cache", () => ({
  getOrFetchArtistsBatch: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: `Artist ${id}`, images: [] }))),
  getOrFetchAlbumsBatch: vi.fn(async (ids: string[]) => ids.map(() => ({ id: "a1", name: "Test Album", images: [] }))),
  getOrFetchTracksBatch: vi.fn(async (ids: string[]) => ids.map(() => ({ id: "t1", name: "Test Track", album: { images: [] } }))),
}));

vi.mock("@/lib/analytics/listening-report-windows", () => ({
  listeningReportInclusiveBoundsForPreset: vi.fn(() => ({ start: "2026-01-01", end: "2026-01-07" })),
  previousListeningReportInclusiveRange: vi.fn(() => ({ start: "2025-12-25", end: "2025-12-31" })),
  inclusiveRangeToListenWindow: vi.fn(() => ({ startIso: "2026-01-01T00:00:00Z", endExclusiveIso: "2026-01-08T00:00:00Z" })),
}));

import { getListeningReports } from "./getListeningReports";

beforeEach(() => {
  buildCallCount = 0;
  vi.clearAllMocks();
});

describe("getListeningReports", () => {
  it("returns items with rank, movement, and isNew fields", async () => {
    const result = await getListeningReports({
      userId: "user-1",
      entityType: "artist",
      range: "week",
      limit: 50,
      offset: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.items.length).toBeGreaterThan(0);
    expect(result!.items[0]).toMatchObject({
      entityId: expect.any(String),
      name: expect.any(String),
      count: expect.any(Number),
      rank: 1,
      isNew: expect.any(Boolean),
    });
  });

  it("returns null for invalid custom range (no dates)", async () => {
    const result = await getListeningReports({
      userId: "user-1",
      entityType: "artist",
      range: "custom",
    });
    expect(result).toBeNull();
  });

  it("offset is respected — returns correct page slice", async () => {
    const page1 = await getListeningReports({
      userId: "user-1",
      entityType: "artist",
      range: "week",
      limit: 1,
      offset: 0,
    });
    const page2 = await getListeningReports({
      userId: "user-1",
      entityType: "artist",
      range: "week",
      limit: 1,
      offset: 1,
    });

    // Items from different pages should have different ranks
    expect(page1!.items[0]?.rank).toBe(1);
    expect(page2!.items[0]?.rank).toBe(2);
  });

  it("nextOffset is null when all items fit on one page", async () => {
    const result = await getListeningReports({
      userId: "user-1",
      entityType: "artist",
      range: "week",
      limit: 50, // more than the 1 artist in mock data
      offset: 0,
    });
    expect(result!.nextOffset).toBeNull();
  });
});
