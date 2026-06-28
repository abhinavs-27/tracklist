import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isEmptyTasteIdentity,
  persistTasteIdentityNoClobber,
} from "./taste-identity-cache-write";
import type { TasteIdentity } from "./types";

const EMPTY: TasteIdentity = {
  topArtists: [],
  topAlbums: [],
  topGenres: [],
  obscurityScore: null,
  diversityScore: 0,
  listeningStyle: "still-forming",
  avgTracksPerSession: 0,
  totalLogs: 0,
  summary: "Log more listens to build your taste profile.",
};

const POPULATED: TasteIdentity = {
  ...EMPTY,
  topArtists: [{ id: "a1", name: "Artist", listenCount: 500, imageUrl: null }],
  topGenres: [{ name: "Rock", weight: 50 }],
  totalLogs: 62231,
  listeningStyle: "the-loyalist",
  summary: "Your plays keep circling back to the same few artists.",
};

// Cold-start seed: totalLogs 0 but real entities surfaced from ratings/favorites.
const SEED: TasteIdentity = {
  ...EMPTY,
  topAlbums: [
    { id: "al1", name: "Album", artistName: "Artist", listenCount: 5, imageUrl: null },
  ],
  summary: "Your taste starts with albums you picked.",
};

function makeAdmin(existingPayload: TasteIdentity | null) {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: existingPayload ? { payload: existingPayload } : null,
      error: null,
    }),
  );
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from } as any, upsert, maybeSingle, select, from };
}

describe("isEmptyTasteIdentity", () => {
  it("treats the EMPTY constant as empty", () => {
    expect(isEmptyTasteIdentity(EMPTY)).toBe(true);
  });

  it("treats a populated identity as not empty", () => {
    expect(isEmptyTasteIdentity(POPULATED)).toBe(false);
  });

  it("treats a cold-start seed (0 logs but has albums) as NOT empty", () => {
    expect(isEmptyTasteIdentity(SEED)).toBe(false);
  });
});

describe("persistTasteIdentityNoClobber", () => {
  it("does NOT overwrite a populated cache with an empty recompute", async () => {
    const { admin, upsert, maybeSingle } = makeAdmin(POPULATED);

    const result = await persistTasteIdentityNoClobber(admin, "u1", EMPTY);

    expect(maybeSingle).toHaveBeenCalled(); // checked existing
    expect(upsert).not.toHaveBeenCalled(); // refused to clobber
    expect(result.totalLogs).toBe(62231); // preserved good data
  });

  it("writes an empty payload when there is no existing cache (genuine new user)", async () => {
    const { admin, upsert } = makeAdmin(null);

    await persistTasteIdentityNoClobber(admin, "u1", EMPTY);

    expect(upsert).toHaveBeenCalledTimes(1);
    const row = (upsert.mock.calls[0] as unknown as [{ payload: TasteIdentity }])[0];
    expect(row.payload.totalLogs).toBe(0);
  });

  it("writes an empty payload when the existing cache is also empty", async () => {
    const { admin, upsert } = makeAdmin(EMPTY);

    await persistTasteIdentityNoClobber(admin, "u1", EMPTY);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("writes a populated recompute without reading existing (fast path)", async () => {
    const { admin, upsert, maybeSingle } = makeAdmin(POPULATED);

    const result = await persistTasteIdentityNoClobber(admin, "u1", POPULATED);

    expect(maybeSingle).not.toHaveBeenCalled(); // no need to guard a non-empty write
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.totalLogs).toBe(62231);
  });
});
