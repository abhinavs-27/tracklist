import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAllTimeAgg, getTotalPlayCount } from "./from-aggregates";

/**
 * These helpers historically swallowed query errors (returning []/0), which let
 * `computeTasteIdentity` build a confidently-wrong identity from a failed read and
 * clobber a heavy user's cache. Strict mode makes a real error throw so the caller
 * can abort — while a genuine empty result (RPC succeeded, 0 rows) still returns []/0.
 */
describe("getAllTimeAgg", () => {
  it("throws on RPC error when throwOnError is set", async () => {
    const admin = {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      getAllTimeAgg(admin, "u1", "album", 200, { throwOnError: true }),
    ).rejects.toThrow(/boom/);
  });

  it("returns [] on RPC error by default (graceful degradation preserved)", async () => {
    const admin = {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(getAllTimeAgg(admin, "u1", "album", 200)).resolves.toEqual([]);
  });

  it("returns [] for a genuine empty result even in strict mode (no error)", async () => {
    const admin = {
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      getAllTimeAgg(admin, "u1", "album", 200, { throwOnError: true }),
    ).resolves.toEqual([]);
  });

  it("maps rows on success", async () => {
    const admin = {
      rpc: vi.fn(() =>
        Promise.resolve({ data: [{ entity_id: "a1", total_count: 5 }], error: null }),
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(getAllTimeAgg(admin, "u1", "artist", 200)).resolves.toEqual([
      { entity_id: "a1", count: 5 },
    ]);
  });
});

describe("getTotalPlayCount", () => {
  function makeAdmin(result: { count: number | null; error: { message: string } | null }) {
    const eq = vi.fn(() => Promise.resolve(result));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { from } as any;
  }

  it("throws on query error when throwOnError is set", async () => {
    const admin = makeAdmin({ count: null, error: { message: "boom" } });

    await expect(getTotalPlayCount(admin, "u1", { throwOnError: true })).rejects.toThrow(
      /boom/,
    );
  });

  it("returns 0 on query error by default", async () => {
    const admin = makeAdmin({ count: null, error: { message: "boom" } });

    await expect(getTotalPlayCount(admin, "u1")).resolves.toBe(0);
  });

  it("returns count on success", async () => {
    const admin = makeAdmin({ count: 47930, error: null });

    await expect(getTotalPlayCount(admin, "u1")).resolves.toBe(47930);
  });
});
