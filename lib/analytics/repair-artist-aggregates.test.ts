import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mock Supabase admin ───────────────────────────────────────────────────────

const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

const mockAdmin = {
  rpc: vi.fn((name: string) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
};

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mockAdmin),
}));

import { repairMissingArtistAggregates } from "./repair-artist-aggregates";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k];
  mockAdmin.rpc.mockImplementation((name: string) =>
    Promise.resolve(rpcResponses[name] ?? { data: null, error: null }),
  );
});

describe("repairMissingArtistAggregates", () => {
  it("calls repair_missing_artist_aggregates RPC with default limit", async () => {
    rpcResponses["repair_missing_artist_aggregates"] = {
      data: [{ inserted_rows: 0 }],
      error: null,
    };

    await repairMissingArtistAggregates();

    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "repair_missing_artist_aggregates",
      expect.objectContaining({ p_limit: expect.any(Number) }),
    );
  });

  it("returns inserted count from RPC result", async () => {
    rpcResponses["repair_missing_artist_aggregates"] = {
      data: [{ inserted_rows: 42 }],
      error: null,
    };

    const result = await repairMissingArtistAggregates();

    expect(result.inserted).toBe(42);
    expect(result.errors).toBe(0);
  });

  it("returns inserted=0 when RPC returns empty data", async () => {
    rpcResponses["repair_missing_artist_aggregates"] = {
      data: [],
      error: null,
    };

    const result = await repairMissingArtistAggregates();

    expect(result.inserted).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("returns errors=1 and inserted=0 when RPC fails", async () => {
    rpcResponses["repair_missing_artist_aggregates"] = {
      data: null,
      error: { message: "rpc timeout" },
    };

    const result = await repairMissingArtistAggregates();

    expect(result.inserted).toBe(0);
    expect(result.errors).toBe(1);
  });

  it("respects custom limit option", async () => {
    rpcResponses["repair_missing_artist_aggregates"] = {
      data: [{ inserted_rows: 0 }],
      error: null,
    };

    await repairMissingArtistAggregates({ limit: 1000 });

    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "repair_missing_artist_aggregates",
      expect.objectContaining({ p_limit: 1000 }),
    );
  });
});
