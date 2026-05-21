import { describe, it, expect } from "vitest";
import { ratingToSyntheticWeight, ratingsToArtistCountMap } from "./ratings-weight";

describe("ratingToSyntheticWeight", () => {
  it("returns 15 for 5 stars", () => expect(ratingToSyntheticWeight(5)).toBe(15));
  it("returns 12 for 4.5 stars", () => expect(ratingToSyntheticWeight(4.5)).toBe(12));
  it("returns 8 for 4 stars", () => expect(ratingToSyntheticWeight(4)).toBe(8));
  it("returns 4 for 3.5 stars", () => expect(ratingToSyntheticWeight(3.5)).toBe(4));
  it("returns 2 for 3 stars", () => expect(ratingToSyntheticWeight(3)).toBe(2));
  it("returns 0 for 2.5 stars", () => expect(ratingToSyntheticWeight(2.5)).toBe(0));
  it("returns 0 for 1 star", () => expect(ratingToSyntheticWeight(1)).toBe(0));
  it("returns 15 for ratings above 5 (treated as max weight)", () => expect(ratingToSyntheticWeight(6)).toBe(15));
  it("returns 0 for 0 stars", () => expect(ratingToSyntheticWeight(0)).toBe(0));
});

describe("ratingsToArtistCountMap", () => {
  it("sums synthetic weights per artist", () => {
    const ratings = [
      { albumId: "a1", artistId: "artist1", rating: 5 },
      { albumId: "a2", artistId: "artist1", rating: 4 },
      { albumId: "a3", artistId: "artist2", rating: 3 },
    ];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.get("artist1")).toBe(23); // 15 + 8
    expect(result.get("artist2")).toBe(2);
  });

  it("excludes ratings below 3 stars", () => {
    const ratings = [
      { albumId: "a1", artistId: "artist1", rating: 2.5 },
      { albumId: "a2", artistId: "artist1", rating: 1 },
    ];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.size).toBe(0);
  });

  it("skips entries with no artistId", () => {
    const ratings = [{ albumId: "a1", artistId: null as unknown as string, rating: 5 }];
    const result = ratingsToArtistCountMap(ratings);
    expect(result.size).toBe(0);
  });

  it("skips entries with empty-string artistId", () => {
    const ratings = [{ albumId: "a1", artistId: "", rating: 5 }];
    expect(ratingsToArtistCountMap(ratings).size).toBe(0);
  });
});
