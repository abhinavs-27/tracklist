import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

const mockAdmin = {
  rpc: vi.fn((name: string) =>
    Promise.resolve(rpcResponses[name] ?? { data: null, error: null }),
  ),
};

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mockAdmin),
}));

import { resolveTrackArtistIdsByName } from "./resolve-track-artist-ids";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k];
  mockAdmin.rpc.mockImplementation((name: string) =>
    Promise.resolve(rpcResponses[name] ?? { data: null, error: null }),
  );
});

describe("resolveTrackArtistIdsByName", () => {
  it("calls resolve_track_artist_ids_from_name RPC with no args by default", async () => {
    rpcResponses["resolve_track_artist_ids_from_name"] = {
      data: [{ tracks_updated: 0 }],
      error: null,
    };

    await resolveTrackArtistIdsByName();

    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "resolve_track_artist_ids_from_name",
      {},
    );
  });

  it("passes p_user_id when userId option is provided", async () => {
    rpcResponses["resolve_track_artist_ids_from_name"] = {
      data: [{ tracks_updated: 5 }],
      error: null,
    };
    const userId = "00000000-0000-0000-0000-000000000001";

    await resolveTrackArtistIdsByName({ userId });

    expect(mockAdmin.rpc).toHaveBeenCalledWith(
      "resolve_track_artist_ids_from_name",
      { p_user_id: userId },
    );
  });

  it("returns tracksUpdated from RPC result", async () => {
    rpcResponses["resolve_track_artist_ids_from_name"] = {
      data: [{ tracks_updated: 42 }],
      error: null,
    };

    const result = await resolveTrackArtistIdsByName();

    expect(result.tracksUpdated).toBe(42);
    expect(result.errors).toBe(0);
  });

  it("returns errors: 1 and tracksUpdated: 0 on RPC error", async () => {
    rpcResponses["resolve_track_artist_ids_from_name"] = {
      data: null,
      error: { message: "timeout" },
    };

    const result = await resolveTrackArtistIdsByName();

    expect(result.tracksUpdated).toBe(0);
    expect(result.errors).toBe(1);
  });

  it("returns tracksUpdated: 0 when RPC returns empty data", async () => {
    rpcResponses["resolve_track_artist_ids_from_name"] = {
      data: [],
      error: null,
    };

    const result = await resolveTrackArtistIdsByName();

    expect(result.tracksUpdated).toBe(0);
    expect(result.errors).toBe(0);
  });
});
