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
  topAlbums: [
    { id: "al1", name: "Album", artistName: "Artist", listenCount: 300, imageUrl: null },
  ],
  topGenres: [{ name: "Rock", weight: 50 }],
  totalLogs: 62231,
  listeningStyle: "the-loyalist",
  summary: "Your plays keep circling back to the same few artists.",
};

// Partial aggregate-read failure: the `get_user_entity_totals` RPC swallowed its
// error and returned [], so the ALBUM list collapsed to empty. Album ratings salvaged
// a couple of synthetic artists (and their genres), and totalLogs came from the
// healthy direct `logs` count — an internally inconsistent payload that is NOT empty.
const ALBUMS_COLLAPSED: TasteIdentity = {
  ...EMPTY,
  topArtists: [
    { id: "a1", name: "Artist", listenCount: 10, imageUrl: null },
    { id: "a2", name: "Artist 2", listenCount: 8, imageUrl: null },
  ],
  topAlbums: [],
  topGenres: [{ name: "Rock", weight: 60 }],
  totalLogs: 47930,
};

// Symmetric partial failure: the ARTIST aggregate read collapsed to empty while
// albums survived (observed live during batch repair: albums=10, artists=0).
const ARTISTS_COLLAPSED: TasteIdentity = {
  ...EMPTY,
  topArtists: [],
  topAlbums: [
    { id: "al1", name: "Album", artistName: "Artist", listenCount: 40, imageUrl: null },
  ],
  topGenres: [],
  totalLogs: 19862,
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

  it("does NOT overwrite a cache that had albums when a recompute's albums collapse to empty despite logs", async () => {
    const { admin, upsert, maybeSingle } = makeAdmin(POPULATED);

    const result = await persistTasteIdentityNoClobber(admin, "u1", ALBUMS_COLLAPSED);

    expect(maybeSingle).toHaveBeenCalled(); // inspected existing
    expect(upsert).not.toHaveBeenCalled(); // refused to clobber
    expect(result.totalLogs).toBe(62231); // preserved good data
    expect(result.topAlbums.length).toBe(1);
  });

  it("does NOT overwrite a cache that had artists when a recompute's artists collapse to empty despite logs", async () => {
    const { admin, upsert, maybeSingle } = makeAdmin(POPULATED);

    const result = await persistTasteIdentityNoClobber(admin, "u1", ARTISTS_COLLAPSED);

    expect(maybeSingle).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(result.totalLogs).toBe(62231);
    expect(result.topArtists.length).toBe(1);
  });

  it("DOES write an album-collapsed recompute when the existing cache never had albums (genuine album-less user)", async () => {
    const albumLessExisting: TasteIdentity = { ...POPULATED, topAlbums: [] };
    const { admin, upsert } = makeAdmin(albumLessExisting);

    await persistTasteIdentityNoClobber(admin, "u1", { ...ALBUMS_COLLAPSED, totalLogs: 120 });

    expect(upsert).toHaveBeenCalledTimes(1); // no albums to protect — legit update
  });

  it("DOES write an artist-collapsed recompute when the existing cache never had artists", async () => {
    const artistLessExisting: TasteIdentity = { ...POPULATED, topArtists: [] };
    const { admin, upsert } = makeAdmin(artistLessExisting);

    await persistTasteIdentityNoClobber(admin, "u1", { ...ARTISTS_COLLAPSED, totalLogs: 120 });

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
