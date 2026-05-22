import { describe, it, expect } from "vitest";
import { genreKey, genreLabel } from "./normalize-genre";

describe("genreKey", () => {
  it("lowercases", () => {
    expect(genreKey("Hip-Hop")).toBe("hip hop");
  });

  it("replaces hyphens with spaces", () => {
    expect(genreKey("hip-hop")).toBe("hip hop");
  });

  it("collapses multiple spaces", () => {
    expect(genreKey("hip  hop")).toBe("hip hop");
  });

  it("makes hip-hop and hip hop the same key", () => {
    expect(genreKey("hip-hop")).toBe(genreKey("hip hop"));
  });

  it("makes lo-fi and lo fi the same key", () => {
    expect(genreKey("lo-fi")).toBe(genreKey("lo fi"));
  });

  it("trims whitespace", () => {
    expect(genreKey("  rock  ")).toBe("rock");
  });
});

describe("genreLabel", () => {
  it("title-cases a plain tag", () => {
    expect(genreLabel("indie rock")).toBe("Indie Rock");
  });

  it("title-cases a hyphenated tag", () => {
    expect(genreLabel("hip-hop")).toBe("Hip Hop");
  });

  it("handles R&B abbreviation", () => {
    expect(genreLabel("r&b")).toBe("R&B");
    expect(genreLabel("R&B")).toBe("R&B");
  });

  it("handles EDM abbreviation", () => {
    expect(genreLabel("edm")).toBe("EDM");
  });

  it("title-cases single word", () => {
    expect(genreLabel("jazz")).toBe("Jazz");
  });
});
