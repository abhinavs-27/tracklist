import { afterEach, describe, expect, it, vi } from "vitest";
import { searchDeezerAlbums, getDeezerAlbum, searchDeezerArtists } from "./client";

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => json,
    } as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchDeezerAlbums", () => {
  it("builds an artist+album query and returns candidates", async () => {
    mockFetchOnce({
      data: [
        { id: 302127, title: "Discovery", artist: { name: "Daft Punk" }, nb_tracks: 14 },
      ],
    });
    const out = await searchDeezerAlbums("Daft Punk", "Discovery");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(302127);
    expect(out[0].title).toBe("Discovery");
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("https://api.deezer.com/search/album");
    expect(decodeURIComponent(url)).toContain('artist:"Daft Punk"');
    expect(decodeURIComponent(url)).toContain('album:"Discovery"');
  });

  it("returns [] when Deezer responds with an error object", async () => {
    mockFetchOnce({ error: { type: "Exception", message: "bad", code: 800 } });
    const out = await searchDeezerAlbums("X", "Y");
    expect(out).toEqual([]);
  });
});

describe("getDeezerAlbum", () => {
  it("returns release_date and nb_tracks from the full album", async () => {
    mockFetchOnce({ id: 302127, title: "Discovery", release_date: "2001-03-07", nb_tracks: 14 });
    const album = await getDeezerAlbum(302127);
    expect(album?.release_date).toBe("2001-03-07");
    expect(album?.nb_tracks).toBe(14);
  });

  it("returns null on error object", async () => {
    mockFetchOnce({ error: { type: "DataException", message: "no data", code: 800 } });
    const album = await getDeezerAlbum(999999999);
    expect(album).toBeNull();
  });
});

describe("searchDeezerArtists", () => {
  it("returns parsed artist items from Deezer response", async () => {
    mockFetchOnce({
      data: [
        { id: 1, name: "Radiohead", picture_xl: "https://deezer.com/img/radiohead.jpg", nb_fan: 5000 },
      ],
    });
    const results = await searchDeezerArtists("Radiohead");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Radiohead");
    expect(results[0].picture_xl).toBe("https://deezer.com/img/radiohead.jpg");
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("https://api.deezer.com/search/artist");
    expect(decodeURIComponent(url)).toContain("Radiohead");
    expect(url).toContain("limit=5");
  });

  it("returns empty array on Deezer error response", async () => {
    mockFetchOnce({ error: { type: "DataException", message: "not found", code: 800 } });
    const results = await searchDeezerArtists("zzz-unknown-artist-zzz");

    expect(results).toEqual([]);
  });
});
