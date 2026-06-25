import { afterEach, describe, expect, it, vi } from "vitest";

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => json } as Response));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

import { matchAlbumDateOnMusicBrainz } from "./match-album-date";

const rg = (over: Record<string, unknown> = {}) => ({
  id: "mbid-1",
  title: "Discovery",
  "first-release-date": "2001-03-07",
  "artist-credit": [{ name: "Daft Punk", artist: { name: "Daft Punk" } }],
  ...over,
});

describe("matchAlbumDateOnMusicBrainz", () => {
  it("returns mbid + full release date for a confident match", async () => {
    mockFetchOnce({ "release-groups": [rg()] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toEqual({ mbid: "mbid-1", releaseDate: "2001-03-07" });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("https://musicbrainz.org/ws/2/release-group");
    expect(url).toContain("fmt=json");
    expect(decodeURIComponent(url)).toContain('artist:"Daft Punk"');
    expect(decodeURIComponent(url)).toContain('releasegroup:"Discovery"');
  });

  it("pads a year-only date to YYYY-01-01", async () => {
    mockFetchOnce({ "release-groups": [rg({ "first-release-date": "2001" })] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toEqual({ mbid: "mbid-1", releaseDate: "2001-01-01" });
  });

  it("pads a year-month date to YYYY-MM-01", async () => {
    mockFetchOnce({ "release-groups": [rg({ "first-release-date": "2001-03" })] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toEqual({ mbid: "mbid-1", releaseDate: "2001-03-01" });
  });

  it("returns null when the only candidate has no usable date", async () => {
    mockFetchOnce({ "release-groups": [rg({ "first-release-date": "" })] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toBeNull();
  });

  it("returns null when the artist does not match", async () => {
    mockFetchOnce({ "release-groups": [rg({ "artist-credit": [{ name: "Other Band", artist: { name: "Other Band" } }] })] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toBeNull();
  });

  it("returns null on empty results", async () => {
    mockFetchOnce({ "release-groups": [] });
    const out = await matchAlbumDateOnMusicBrainz("Daft Punk", "Discovery");
    expect(out).toBeNull();
  });
});
