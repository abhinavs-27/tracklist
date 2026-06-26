import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mock Supabase admin ───────────────────────────────────────────────────────

let fromQueues: Record<string, { data: unknown; error: unknown }[]> = {};

function makeBuilder(response: { data: unknown; error: unknown }) {
  const resolved = Promise.resolve(response);
  const b: Record<string, unknown> = {};
  const chain = () => b;
  // Make the builder itself thenable so `await builder` resolves to the response
  (b as Record<string, unknown>).then = (resolve: (v: unknown) => void) =>
    resolved.then(resolve);
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

import {
  getArtistFriendLeaderboard,
  getAlbumFriendLeaderboard,
  getSongFriendLeaderboard,
} from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  fromQueues = {};
  mockAdmin.from.mockImplementation((table: string) => {
    const queue = fromQueues[table] ?? [];
    const resp = queue.shift() ?? { data: null, error: null };
    return makeBuilder(resp);
  });
});

describe("getArtistFriendLeaderboard", () => {
  it("returns null when no users have plays", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    const result = await getArtistFriendLeaderboard("viewer-id", "artist-1");

    expect(result).toBeNull();
  });

  it("returns sorted leaderboard from aggregates", async () => {
    fromQueues["follows"] = [{ data: [{ following_id: "friend-1" }], error: null }];
    fromQueues["user_listening_aggregates"] = [
      {
        data: [
          { user_id: "viewer-id", count: 100 },
          { user_id: "friend-1", count: 250 },
        ],
        error: null,
      },
    ];
    fromQueues["users"] = [
      {
        data: [
          { id: "viewer-id", username: "viewer", avatar_url: null },
          { id: "friend-1", username: "friend", avatar_url: null },
        ],
        error: null,
      },
    ];

    const result = await getArtistFriendLeaderboard("viewer-id", "artist-1");

    expect(result).not.toBeNull();
    expect(result![0].userId).toBe("friend-1");
    expect(result![0].playCount).toBe(250);
    expect(result![1].userId).toBe("viewer-id");
    expect(result![1].isViewer).toBe(true);
  });

  it("does NOT query tracks or logs tables", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    await getArtistFriendLeaderboard("viewer-id", "artist-1");

    const tablesQueried = mockAdmin.from.mock.calls.map((c) => c[0]);
    expect(tablesQueried).not.toContain("tracks");
    expect(tablesQueried).not.toContain("logs");
  });
});

describe("getAlbumFriendLeaderboard", () => {
  it("returns null when no users have plays", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    const result = await getAlbumFriendLeaderboard("viewer-id", "album-1");

    expect(result).toBeNull();
  });

  it("returns leaderboard from aggregates", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [
      { data: [{ user_id: "viewer-id", count: 7 }], error: null },
    ];
    fromQueues["users"] = [
      { data: [{ id: "viewer-id", username: "viewer", avatar_url: null }], error: null },
    ];

    const result = await getAlbumFriendLeaderboard("viewer-id", "album-1");

    expect(result).not.toBeNull();
    expect(result![0].playCount).toBe(7);
  });

  it("does NOT query tracks or logs", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    await getAlbumFriendLeaderboard("viewer-id", "album-1");

    const tablesQueried = mockAdmin.from.mock.calls.map((c) => c[0]);
    expect(tablesQueried).not.toContain("tracks");
    expect(tablesQueried).not.toContain("logs");
  });
});

describe("getSongFriendLeaderboard", () => {
  it("returns null when no users have plays", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    const result = await getSongFriendLeaderboard("viewer-id", "track-1");

    expect(result).toBeNull();
  });

  it("returns leaderboard from aggregates", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [
      { data: [{ user_id: "viewer-id", count: 3 }], error: null },
    ];
    fromQueues["users"] = [
      { data: [{ id: "viewer-id", username: "viewer", avatar_url: null }], error: null },
    ];

    const result = await getSongFriendLeaderboard("viewer-id", "track-1");

    expect(result).not.toBeNull();
    expect(result![0].playCount).toBe(3);
  });

  it("does NOT query logs", async () => {
    fromQueues["follows"] = [{ data: [], error: null }];
    fromQueues["user_listening_aggregates"] = [{ data: [], error: null }];

    await getSongFriendLeaderboard("viewer-id", "track-1");

    const tablesQueried = mockAdmin.from.mock.calls.map((c) => c[0]);
    expect(tablesQueried).not.toContain("logs");
  });
});
