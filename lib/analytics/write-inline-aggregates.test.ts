import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Supabase mock ─────────────────────────────────────────────────────────────

const { upsertMock, mockAdmin, mockAccumulate, mockApply } = vi.hoisted(() => {
  const upsertMock = vi.fn(async () => ({ error: null }));
  const mockAdmin = {
    from: vi.fn((_table: string) => ({
      upsert: upsertMock,
    })),
  };
  const mockAccumulate = vi.fn(() => ({
    deltas: new Map([["key1", 1]]),
    genreContribDeltas: new Map<string, number>(),
    touchedGenreBuckets: new Set<string>(),
  }));
  const mockApply = vi.fn(async () => ({ errors: 0 }));
  return { upsertMock, mockAdmin, mockAccumulate, mockApply };
});

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(() => mockAdmin),
}));

// ── Analytics mock ────────────────────────────────────────────────────────────

vi.mock("@/lib/analytics/listening-aggregate-deltas", () => ({
  accumulateListeningAggregateDeltas: mockAccumulate,
  applyListeningAggregateDeltaMaps: mockApply,
}));

import { writeInlineAggregates } from "./write-inline-aggregates";

const LOG_A = {
  id: "log-1",
  user_id: "user-1",
  track_id: "track-uuid-1",
  listened_at: "2024-01-15T10:00:00Z",
};

const CATALOG: Map<string, { artistId: string | null; albumId: string | null }> = new Map([
  ["track-uuid-1", { artistId: "artist-uuid-1", albumId: "album-uuid-1" }],
]);

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
  mockAdmin.from.mockImplementation((_table: string) => ({
    upsert: upsertMock,
  }));
  mockAccumulate.mockReturnValue({
    deltas: new Map([["key1", 1]]),
    genreContribDeltas: new Map(),
    touchedGenreBuckets: new Set(),
  });
  mockApply.mockResolvedValue({ errors: 0 });
});

describe("writeInlineAggregates", () => {
  it("calls accumulateListeningAggregateDeltas with songByTrack built from catalog", async () => {
    await writeInlineAggregates([LOG_A], CATALOG);

    expect(mockAccumulate).toHaveBeenCalledOnce();
    const [rows, ctx, opts] = mockAccumulate.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].track_id).toBe("track-uuid-1");
    expect(rows[0].artist_id).toBe("artist-uuid-1");
    expect(rows[0].album_id).toBe("album-uuid-1");
    expect(ctx.songByTrack.get("track-uuid-1")).toEqual({
      artist_id: "artist-uuid-1",
      album_id: "album-uuid-1",
    });
    expect(opts.includeTrackBumps).toBe(true);
  });

  it("marks logs in user_listening_aggregate_ingest after applying deltas", async () => {
    await writeInlineAggregates([LOG_A], CATALOG);

    expect(mockApply).toHaveBeenCalledOnce();
    expect(mockAdmin.from).toHaveBeenCalledWith("user_listening_aggregate_ingest");
    expect(upsertMock).toHaveBeenCalledWith(
      [{ log_id: "log-1" }],
      { onConflict: "log_id", ignoreDuplicates: true },
    );
  });

  it("does not throw when applyListeningAggregateDeltaMaps rejects", async () => {
    mockApply.mockRejectedValueOnce(new Error("rpc timeout"));
    await expect(writeInlineAggregates([LOG_A], CATALOG)).resolves.toBeUndefined();
  });

  it("does nothing and skips DB calls when logs array is empty", async () => {
    await writeInlineAggregates([], CATALOG);
    expect(mockAccumulate).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
