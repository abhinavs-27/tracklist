import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("bottleneck", () => ({
  default: class {
    schedule<T>(fn: () => Promise<T>) { return fn(); }
  },
}));
vi.mock("@/lib/http/with-retry", () => ({
  withRetry: async <T>(fn: (sig: AbortSignal) => Promise<T>) => fn(new AbortController().signal),
}));

// ── Supabase admin mock ──────────────────────────────────────────────────────
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ from: mockFrom }),
}));

// ── Deezer client mocks ──────────────────────────────────────────────────────
const mockSearchDeezerArtists = vi.fn();
const mockGetDeezerArtistAlbums = vi.fn();
const mockGetDeezerAlbumTracks = vi.fn();
vi.mock("./client", () => ({
  searchDeezerArtists: (...a: unknown[]) => mockSearchDeezerArtists(...a),
  getDeezerArtistAlbums: (...a: unknown[]) => mockGetDeezerArtistAlbums(...a),
  getDeezerAlbumTracks: (...a: unknown[]) => mockGetDeezerAlbumTracks(...a),
}));

// ── entity-resolution mock ───────────────────────────────────────────────────
const mockFindAlbumIdByArtistAndName = vi.fn();
vi.mock("@/lib/catalog/entity-resolution", () => ({
  findAlbumIdByArtistAndName: (...a: unknown[]) => mockFindAlbumIdByArtistAndName(...a),
}));

// ── artistMatches mock ───────────────────────────────────────────────────────
vi.mock("@/lib/lastfm/normalize-lastfm-search", () => ({
  artistMatches: (_name: string, candidates: string[]) => ({
    score: candidates[0] ? 30 : 0,
    match: candidates[0] ?? "",
  }),
}));

import { syncArtistDiscography } from "./sync-discography";

// Minimal Supabase chain builder
function makeChain(finalValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "update", "insert", "upsert", "maybeSingle", "single", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain["maybeSingle"] = vi.fn(async () => finalValue);
  chain["single"] = vi.fn(async () => finalValue);
  chain["select"] = vi.fn(() => chain);
  chain["update"] = vi.fn(() => chain);
  chain["insert"] = vi.fn(async () => finalValue);
  chain["upsert"] = vi.fn(async () => ({ error: null }));
  chain["eq"] = vi.fn(() => chain);
  chain["limit"] = vi.fn(() => chain);
  return chain;
}

describe("syncArtistDiscography", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeezerAlbumTracks.mockResolvedValue([]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue(null);
  });

  it("skips artist not found in DB", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    await syncArtistDiscography("artist-uuid-1");
    // No albums were fetched
    expect(mockGetDeezerArtistAlbums).not.toHaveBeenCalled();
  });

  it("skips within 7-day guard window", async () => {
    const recentSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    mockFrom.mockReturnValue(
      makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: recentSync } }),
    );
    await syncArtistDiscography("artist-uuid-2");
    expect(mockGetDeezerArtistAlbums).not.toHaveBeenCalled();
  });

  it("uses stored Deezer ID when present in artist_external_ids", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // artists select
        return makeChain({ data: { name: "Test Artist", mbid: null, discography_synced_at: null } });
      }
      if (callCount === 2) {
        // artist_external_ids select
        return makeChain({ data: { external_id: "987" } });
      }
      // all subsequent: albums, tracks, stamp
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 10, title: "Album One", release_date: "2020-01-01", cover_xl: "https://img", record_type: "album", nb_tracks: 10 },
    ]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue(null);

    await syncArtistDiscography("artist-uuid-3");

    expect(mockSearchDeezerArtists).not.toHaveBeenCalled();
    expect(mockGetDeezerArtistAlbums).toHaveBeenCalledWith(987);
  });

  it("searches for Deezer artist when no stored ID, stores result", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return makeChain({ data: { name: "New Artist", mbid: null, discography_synced_at: null } });
      }
      if (callCount === 2) {
        // artist_external_ids — no stored ID
        return makeChain({ data: null });
      }
      return makeChain({ data: null, error: null });
    });
    mockSearchDeezerArtists.mockResolvedValue([{ id: 42, name: "New Artist" }]);
    mockGetDeezerArtistAlbums.mockResolvedValue([]);

    await syncArtistDiscography("artist-uuid-4");

    expect(mockSearchDeezerArtists).toHaveBeenCalledWith("New Artist", 5);
    expect(mockGetDeezerArtistAlbums).toHaveBeenCalledWith(42);
  });

  it("filters out singles and live records", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: { external_id: "55" } });
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 1, title: "LP", record_type: "album", release_date: "2020-01-01", cover_xl: "", nb_tracks: 12 },
      { id: 2, title: "EP", record_type: "ep", release_date: "2020-06-01", cover_xl: "", nb_tracks: 5 },
      { id: 3, title: "Single", record_type: "single", release_date: "2020-02-01", cover_xl: "", nb_tracks: 1 },
      { id: 4, title: "Live", record_type: "live", release_date: "2020-09-01", cover_xl: "", nb_tracks: 18 },
    ]);

    await syncArtistDiscography("artist-uuid-5");

    // Only album(1) and ep(2) should trigger album lookup
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledTimes(2);
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledWith(expect.anything(), "artist-uuid-5", "LP");
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledWith(expect.anything(), "artist-uuid-5", "EP");
  });

  it("skips image update when album already has image_url", async () => {
    let callCount = 0;
    const updateMock = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: { external_id: "55" } });
      // album image check — has image already
      if (callCount === 3) {
        const chain = makeChain({ data: { image_url: "https://existing.jpg" } });
        chain["update"] = updateMock;
        return chain;
      }
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 1, title: "LP", record_type: "album", release_date: "2020-01-01", cover_xl: "https://new.jpg", nb_tracks: 10 },
    ]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue("existing-album-id");

    await syncArtistDiscography("artist-uuid-6");

    expect(updateMock).not.toHaveBeenCalled();
  });
});
