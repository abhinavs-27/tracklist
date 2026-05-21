import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const queriedTables: string[] = [];
const tableResponses: Record<string, { data: unknown; error: unknown }> = {};

function createChain(tableName: string) {
  const pending = tableResponses[tableName] ?? { data: [], error: null };
  const resolvedPromise = Promise.resolve(pending);

  const thennable = {
    then: (res: (v: unknown) => unknown) => resolvedPromise.then(res),
    catch: (rej: (e: unknown) => unknown) => resolvedPromise.catch(rej),
  };

  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(resolvedPromise),
    not: vi.fn().mockReturnValue(resolvedPromise),
  };

  // Make select() produce an awaitable that resolves
  chain.select = vi.fn().mockReturnValue({ ...chain, ...thennable });

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

import {
  getCommunityHeroListeningData,
  getCommunityMemberGrowthThisWeek,
} from "./get-community-hero-data";

beforeEach(() => {
  queriedTables.length = 0;
  vi.clearAllMocks();
  mockAdmin.from.mockImplementation((table: string) => {
    queriedTables.push(table);
    return createChain(table);
  });
  for (const key of Object.keys(tableResponses)) {
    delete tableResponses[key];
  }
});

describe("getCommunityHeroListeningData", () => {
  it("returns empty when community has no members", async () => {
    tableResponses["community_members"] = { data: [], error: null };
    const result = await getCommunityHeroListeningData("community-1");
    expect(result).toEqual({ topArtists: [], backgroundImageUrls: [] });
    expect(queriedTables).not.toContain("logs");
  });

  it("uses user_listening_aggregates fast path when data is available", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }, { user_id: "u2" }],
      error: null,
    };
    tableResponses["user_listening_aggregates"] = {
      data: [
        { entity_id: "artist-A", count: 100 },
        { entity_id: "artist-B", count: 50 },
        { entity_id: "artist-C", count: 25 },
      ],
      error: null,
    };
    tableResponses["artists"] = {
      data: [
        { id: "artist-A", name: "Artist A", image_url: "https://img.a" },
        { id: "artist-B", name: "Artist B", image_url: "https://img.b" },
        { id: "artist-C", name: "Artist C", image_url: null },
      ],
      error: null,
    };

    const result = await getCommunityHeroListeningData("community-1");

    // Must NOT hit logs table
    expect(queriedTables).not.toContain("logs");
    expect(queriedTables).toContain("user_listening_aggregates");

    expect(result.topArtists).toHaveLength(3);
    expect(result.topArtists[0]!.id).toBe("artist-A");
    expect(result.topArtists[0]!.listens).toBe(100);
    expect(result.topArtists[1]!.id).toBe("artist-B");
    expect(result.backgroundImageUrls).toContain("https://img.a");
    expect(result.backgroundImageUrls).toContain("https://img.b");
    // null image_url is excluded from background
    expect(result.backgroundImageUrls).not.toContain(null);
  });

  it("falls back to raw logs when no aggregate data exists", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }],
      error: null,
    };
    // Aggregates empty — trigger fallback
    tableResponses["user_listening_aggregates"] = { data: [], error: null };
    tableResponses["logs"] = { data: [], error: null };

    await getCommunityHeroListeningData("community-1");

    expect(queriedTables).toContain("logs");
  });

  it("returns at most 3 top artists for display", async () => {
    tableResponses["community_members"] = {
      data: [{ user_id: "u1" }],
      error: null,
    };
    tableResponses["user_listening_aggregates"] = {
      data: [
        { entity_id: "a1", count: 100 },
        { entity_id: "a2", count: 90 },
        { entity_id: "a3", count: 80 },
        { entity_id: "a4", count: 70 },
        { entity_id: "a5", count: 60 },
      ],
      error: null,
    };
    tableResponses["artists"] = {
      data: [
        { id: "a1", name: "A1", image_url: "https://a1.jpg" },
        { id: "a2", name: "A2", image_url: "https://a2.jpg" },
        { id: "a3", name: "A3", image_url: "https://a3.jpg" },
        { id: "a4", name: "A4", image_url: "https://a4.jpg" },
        { id: "a5", name: "A5", image_url: "https://a5.jpg" },
      ],
      error: null,
    };

    const result = await getCommunityHeroListeningData("community-1");

    expect(result.topArtists).toHaveLength(3);
    // Background can include more (up to 6)
    expect(result.backgroundImageUrls.length).toBeLessThanOrEqual(6);
  });
});

describe("getCommunityMemberGrowthThisWeek", () => {
  it("returns 0 when communityId is blank", async () => {
    const result = await getCommunityMemberGrowthThisWeek("");
    expect(result).toBe(0);
  });

  it("returns count from community_members query", async () => {
    tableResponses["community_members"] = { data: null, error: null };
    // The count query uses { count: "exact", head: true } — mock the resolved value
    mockAdmin.from.mockImplementationOnce((table: string) => {
      queriedTables.push(table);
      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnValue(Promise.resolve({ count: 5, error: null })),
      };
      return chain;
    });

    const result = await getCommunityMemberGrowthThisWeek("community-1");
    expect(result).toBe(5);
  });
});
