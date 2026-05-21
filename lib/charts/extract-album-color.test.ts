import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, lightenHex, darkenHex } from "./extract-album-color";

describe("hexToHsl", () => {
  it("converts pure red", () => {
    const [h, s, l] = hexToHsl("#ff0000");
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it("converts white", () => {
    const [h, s, l] = hexToHsl("#ffffff");
    expect(l).toBeCloseTo(100, 0);
  });

  it("converts black", () => {
    const [h, s, l] = hexToHsl("#000000");
    expect(l).toBeCloseTo(0, 0);
  });
});

describe("hslToHex", () => {
  it("round-trips pure red", () => {
    const result = hslToHex(0, 100, 50);
    expect(result).toBe("#ff0000");
  });

  it("round-trips white", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
  });
});

describe("lightenHex", () => {
  it("lightens a dark color", () => {
    const [, , lBefore] = hexToHsl("#1a0a03");
    const lightened = lightenHex("#1a0a03", 0.3);
    const [, , lAfter] = hexToHsl(lightened);
    expect(lAfter).toBeGreaterThan(lBefore);
  });

  it("clamps lightness at 85", () => {
    const result = lightenHex("#ffffff", 0.5);
    const [, , l] = hexToHsl(result);
    expect(l).toBeLessThanOrEqual(85);
  });
});

describe("darkenHex", () => {
  it("darkens a light color", () => {
    const [, , lBefore] = hexToHsl("#f97316");
    const darkened = darkenHex("#f97316", 0.4);
    const [, , lAfter] = hexToHsl(darkened);
    expect(lAfter).toBeLessThan(lBefore);
  });

  it("clamps lightness at 8", () => {
    const result = darkenHex("#000000", 0.5);
    const [, , l] = hexToHsl(result);
    expect(l).toBeGreaterThanOrEqual(8.2); // actual floor is ~8.235 due to hex quantization
  });
});
