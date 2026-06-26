import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mock Supabase admin ───────────────────────────────────────────────────────

let fromQueues: Record<string, { data: unknown; error: unknown }[]> = {};

function makeBuilder(response: { data: unknown; error: unknown }) {
  const resolved = Promise.resolve(response);
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = vi.fn(chain);
  b.eq = vi.fn(chain);
  b.in = vi.fn(chain);
  b.is = vi.fn(chain);
  b.order = vi.fn(chain);
  b.limit = vi.fn(() => resolved);
  b.maybeSingle = vi.fn(() => resolved);
  return b;
}

const mockAdmin = {
  from: vi.fn((table: string) => {
    const queue = fromQueues[table] ?? [];
    const resp = queue.shift() ?? { data: null, error: null };
    return makeBuilder(resp);
  }),
};

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mockAdmin),
}));

import { fetchArtistViewerStats } from "./artist-db-feed";

beforeEach(() => {
  vi.clearAllMocks();
  fromQueues = {};
  mockAdmin.from.mockImplementation((table: string) => {
    const queue = fromQueues[table] ?? [];
    const resp = queue.shift() ?? { data: null, error: null };
    return makeBuilder(resp);
  });
});

describe("fetchArtistViewerStats", () => {
  it("returns playCount from user_listening_aggregates all-time row (artist has no albums)", async () => {
    // artist agg (maybeSingle) — no albums means the album-aggs query is never reached
    fromQueues["user_listening_aggregates"] = [
      { data: { count: 42 }, error: null },
    ];
    // artist albums list — empty, so albumIds.length === 0 and album-aggs block is skipped
    fromQueues["albums"] = [{ data: [], error: null }];
    // tracks for firstListened
    fromQueues["tracks"] = [{ data: [], error: null }];

    const result = await fetchArtistViewerStats("artist-1", "viewer-1");

    expect(result.playCount).toBe(42);
  });

  it("returns playCount=0 and empty fields when no aggregate row exists", async () => {
    fromQueues["user_listening_aggregates"] = [{ data: null, error: null }];

    const result = await fetchArtistViewerStats("artist-1", "viewer-1");

    expect(result).toEqual({
      playCount: 0,
      topAlbumName: null,
      topAlbumId: null,
      firstListened: null,
    });
  });

  it("returns topAlbumId from album aggregates", async () => {
    fromQueues["user_listening_aggregates"] = [
      // artist agg
      { data: { count: 10 }, error: null },
      // album aggs
      { data: [{ entity_id: "album-1", count: 10 }], error: null },
    ];
    fromQueues["albums"] = [
      // artist albums list
      { data: [{ id: "album-1" }], error: null },
      // album name lookup
      { data: { name: "DAMN." }, error: null },
    ];
    // tracks for firstListened
    fromQueues["tracks"] = [{ data: [], error: null }];

    const result = await fetchArtistViewerStats("artist-1", "viewer-1");

    expect(result.topAlbumId).toBe("album-1");
    expect(result.topAlbumName).toBe("DAMN.");
  });

  it("returns firstListened from logs", async () => {
    // artist agg (maybeSingle)
    fromQueues["user_listening_aggregates"] = [
      { data: { count: 5 }, error: null },
      // album aggs after no albums found
      { data: [], error: null },
    ];
    // artist albums list — empty, so albumIds.length === 0
    fromQueues["albums"] = [{ data: [], error: null }];
    // tracks — non-empty so the firstListened log-query loop runs
    fromQueues["tracks"] = [{ data: [{ id: "track-1" }], error: null }];
    // logs query (order + limit terminal call)
    fromQueues["logs"] = [
      { data: [{ listened_at: "2023-01-15T00:00:00Z" }], error: null },
    ];

    const result = await fetchArtistViewerStats("artist-1", "viewer-1");

    expect(result.firstListened).toBe("2023-01-15T00:00:00Z");
  });
});
