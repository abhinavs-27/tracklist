import { describe, it, expect } from "vitest";

import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits into consecutive groups of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one chunk when size >= length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("returns [] for an empty array", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("throws for size < 1", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});
