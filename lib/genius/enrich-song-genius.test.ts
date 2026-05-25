import { describe, it, expect } from "vitest";
import { normalizeTitle, isTitleMatch, isArtistMatch } from "./enrich-song-genius";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("HUMBLE.")).toBe("humble");
  });

  it("strips parenthetical feat", () => {
    expect(normalizeTitle("You're Stuck (feat. Summer Walker)")).toBe("youre stuck");
  });

  it("strips bracketed feat", () => {
    expect(normalizeTitle("Money Trees [feat. Jay Rock]")).toBe("money trees");
  });

  it("collapses extra whitespace", () => {
    expect(normalizeTitle("  hello   world  ")).toBe("hello world");
  });

  it("strips apostrophes and special chars", () => {
    expect(normalizeTitle("Can't Stop the Feeling!")).toBe("cant stop the feeling");
  });
});

describe("isTitleMatch", () => {
  it("matches identical titles after normalization", () => {
    expect(isTitleMatch("HUMBLE.", "HUMBLE.")).toBe(true);
  });

  it("matches when track has feat and Genius does not", () => {
    expect(isTitleMatch("You're Stuck (feat. Summer Walker)", "You're Stuck")).toBe(true);
  });

  it("matches when Genius has feat and track does not", () => {
    expect(isTitleMatch("Money Trees", "Money Trees (feat. Jay Rock)")).toBe(true);
  });

  it("does not match different songs", () => {
    expect(isTitleMatch("DNA.", "HUMBLE.")).toBe(false);
  });

  it("does not match short title that is a substring of a different title", () => {
    // "god" is a substring of "gods plan" — but too short to be a reliable match
    expect(isTitleMatch("God", "God's Plan")).toBe(false);
  });
});

describe("isArtistMatch", () => {
  it("matches identical artist names", () => {
    expect(isArtistMatch("Kendrick Lamar", "Kendrick Lamar")).toBe(true);
  });

  it("matches when one is substring of the other", () => {
    expect(isArtistMatch("SZA", "SZA")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isArtistMatch("drake", "Drake")).toBe(true);
  });

  it("does not match different artists", () => {
    expect(isArtistMatch("Drake", "Kendrick Lamar")).toBe(false);
  });
});
