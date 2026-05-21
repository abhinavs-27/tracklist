import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Track which tables were queried
const queriedTables: string[] = [];

type MockChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  _resolve: (v: { data: unknown; error: unknown }) => void;
};

// Per-table response registry — tests set these before each call
const tableResponses: Record<string, { data: unknown; error: unknown }> = {};

function createChain(tableName: string): MockChain {
  const pending = tableResponses[tableName] ?? { data: [], error: null };
  const resolvedPromise = Promise.resolve(pending);

  const chain: MockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(resolvedPromise),
    not: vi.fn().mockReturnValue(resolvedPromise),
    _resolve: () => {},
  };

  // Any awaited terminal on the chain resolves with the table response
  (chain.select as ReturnType<typeof vi.fn>).mockReturnValue({
    ...chain,
    then: (res: (v: unknown) => unknown) => resolvedPromise.then(res),
    catch: (rej: (e: unknown) => unknown) => resolvedPromise.catch(rej),
  });

  return chain;
}

const mockAdmin = {
  from: vi.fn((table: string) => {
    queriedTables.push(table);
    return createChain(table);
  }),
};

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mockAdmin),
}));

import { buildCommunityVector } from "./buildCommunityVector";

beforeEach(() => {
  queriedTables.length = 0;
  vi.clearAllMocks();
  mockAdmin.from.mockImplementation((table: string) => {
    queriedTables.push(table);
    return createChain(table);
  });
  // Reset table responses
  for (const key of Object.keys(tableResponses)) {
    delete tableResponses[key];
  }
});

describe("buildCommunityVector", () => {
  it("returns empty when communityId is blank", async () => {
    const result = await buildCommunityVector("");
    expect(result).toEqual({});
    expect(queriedTables).toHaveLength(0);
  });

  it("returns empty when community has no members", async () => {
    tableResponses["community_members"] = { data: [], error: null };
    const result = await buildCommunityVector("community-1");
    expect(result).toEqual({});
    expect(queriedTables).not.toContain("logs");
    expect(queriedTables).not.toContain("user_listening_aggregates");
  });

  it("uses user_listening_aggregates fast path when data is available", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }, { user_id: "u2" }],
      error: null,
    };
    tableResponses["user_listening_aggregates"] = {
      data: [
        { entity_id: "artist-A", count: 50 },
        { entity_id: "artist-B", count: 30 },
      ],
      error: null,
    };

    const result = await buildCommunityVector("community-1");

    // Fast path used: logs table must NOT be queried
    expect(queriedTables).not.toContain("logs");
    expect(queriedTables).toContain("user_listening_aggregates");

    // Result normalized over total counts (50 + 30 = 80)
    expect(result["artist-A"]).toBeCloseTo(50 / 80);
    expect(result["artist-B"]).toBeCloseTo(30 / 80);
  });

  it("falls back to logs when no aggregate rows exist for community members", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }],
      error: null,
    };
    // Aggregates return empty — trigger fallback
    tableResponses["user_listening_aggregates"] = { data: [], error: null };
    // Logs also empty — just verifying logs IS queried
    tableResponses["logs"] = { data: [], error: null };

    await buildCommunityVector("community-1");

    expect(queriedTables).toContain("logs");
  });

  it("sums counts across multiple members from aggregates", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }, { user_id: "u2" }],
      error: null,
    };
    tableResponses["user_listening_aggregates"] = {
      data: [
        // u1 listens
        { entity_id: "artist-A", count: 40 },
        // u2 also listens to artist-A
        { entity_id: "artist-A", count: 20 },
        { entity_id: "artist-B", count: 10 },
      ],
      error: null,
    };

    const result = await buildCommunityVector("community-1");

    const total = 40 + 20 + 10; // 70
    expect(result["artist-A"]).toBeCloseTo(60 / total);
    expect(result["artist-B"]).toBeCloseTo(10 / total);
  });
});
