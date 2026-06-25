import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  searchDeezerAlbums: vi.fn(),
  getDeezerAlbum: vi.fn(),
}));

import { searchDeezerAlbums, getDeezerAlbum } from "./client";
import { matchAlbumOnDeezer } from "./match";

const mockedSearch = searchDeezerAlbums as unknown as ReturnType<typeof vi.fn>;
const mockedGet = getDeezerAlbum as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("matchAlbumOnDeezer", () => {
  it("returns release_date + total_tracks for a confident match", async () => {
    mockedSearch.mockResolvedValue([
      { id: 302127, title: "Discovery", artist: { name: "Daft Punk" }, nb_tracks: 14 },
    ]);
    mockedGet.mockResolvedValue({
      id: 302127,
      title: "Discovery",
      release_date: "2001-03-07",
      nb_tracks: 14,
    });
    const out = await matchAlbumOnDeezer("Daft Punk", "Discovery");
    expect(out).not.toBeNull();
    expect(out!.deezerAlbumId).toBe(302127);
    expect(out!.releaseDate).toBe("2001-03-07");
    expect(out!.totalTracks).toBe(14);
  });

  it("returns null when the artist does not match", async () => {
    mockedSearch.mockResolvedValue([
      { id: 1, title: "Discovery", artist: { name: "Some Other Band" }, nb_tracks: 14 },
    ]);
    const out = await matchAlbumOnDeezer("Daft Punk", "Discovery");
    expect(out).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("returns null when search yields nothing", async () => {
    mockedSearch.mockResolvedValue([]);
    const out = await matchAlbumOnDeezer("Daft Punk", "Discovery");
    expect(out).toBeNull();
  });

  it("returns null when the full album has no release_date", async () => {
    mockedSearch.mockResolvedValue([
      { id: 302127, title: "Discovery", artist: { name: "Daft Punk" }, nb_tracks: 14 },
    ]);
    mockedGet.mockResolvedValue({ id: 302127, title: "Discovery", nb_tracks: 14 });
    const out = await matchAlbumOnDeezer("Daft Punk", "Discovery");
    expect(out).toBeNull();
  });
});
