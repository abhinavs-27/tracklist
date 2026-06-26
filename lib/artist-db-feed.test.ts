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
  it("returns playCount from user_listening_aggregates all-time row", async () => {
    // artist agg (maybeSingle)
    fromQueues["user_listening_aggregates"] = [
      { data: { count: 42 }, error: null },
      // album aggs (limit)
      { data: [], error: null },
    ];
    // artist albums list
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
});
