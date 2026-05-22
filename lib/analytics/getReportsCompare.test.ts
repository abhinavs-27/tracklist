import { describe, it, expect } from "vitest";

// Test the pure helper functions extracted from getReportsCompare.ts

// ── pickTopMovers ──────────────────────────────────────────────────────────────
// We test the function signature we WANT (returns deltas) even though the
// current implementation doesn't return them — these tests will fail first.

import { pickTopMovers, countNewEntries } from "./getReportsCompare";

describe("pickTopMovers", () => {
  it("returns null gainer and dropper when there is no overlap", () => {
    const current = [{ entity_id: "a", count: 10 }];
    const previous = [{ entity_id: "b", count: 10 }];
    const result = pickTopMovers(current, previous);
    expect(result.gainerId).toBeNull();
    expect(result.dropperId).toBeNull();
    expect(result.gainerDelta).toBeNull();
    expect(result.dropperDelta).toBeNull();
  });

  it("identifies gainer with correct positive delta", () => {
    // a was rank 5 previously, now rank 1 → delta = 5 - 1 = +4
    const current = [
      { entity_id: "a", count: 100 }, // rank 1
      { entity_id: "b", count: 50 },  // rank 2
      { entity_id: "c", count: 30 },  // rank 3
    ];
    const previous = [
      { entity_id: "b", count: 100 }, // rank 1
      { entity_id: "c", count: 50 },  // rank 2
      { entity_id: "d", count: 40 },  // rank 3
      { entity_id: "e", count: 30 },  // rank 4
      { entity_id: "a", count: 20 },  // rank 5
    ];
    const result = pickTopMovers(current, previous);
    expect(result.gainerId).toBe("a");
    expect(result.gainerDelta).toBe(4); // +4 spots
  });

  it("identifies dropper with correct negative delta", () => {
    // b was rank 1 previously, now rank 2 → delta = 1 - 2 = -1
    const current = [
      { entity_id: "a", count: 100 }, // rank 1
      { entity_id: "b", count: 50 },  // rank 2
    ];
    const previous = [
      { entity_id: "b", count: 100 }, // rank 1
      { entity_id: "a", count: 50 },  // rank 2
    ];
    const result = pickTopMovers(current, previous);
    expect(result.dropperId).toBe("b");
    expect(result.dropperDelta).toBe(-1); // dropped 1 spot
  });

  it("returns null gainer when no item improved its rank", () => {
    // All items stayed the same rank
    const current = [
      { entity_id: "a", count: 10 },
      { entity_id: "b", count: 5 },
    ];
    const previous = [
      { entity_id: "a", count: 10 },
      { entity_id: "b", count: 5 },
    ];
    const result = pickTopMovers(current, previous);
    expect(result.gainerId).toBeNull();
    expect(result.gainerDelta).toBeNull();
    expect(result.dropperId).toBeNull();
    expect(result.dropperDelta).toBeNull();
  });
});

describe("countNewEntries", () => {
  it("returns 0 when all current items were in previous", () => {
    const current = [
      { entity_id: "a", count: 10 },
      { entity_id: "b", count: 5 },
    ];
    const previous = [
      { entity_id: "a", count: 8 },
      { entity_id: "b", count: 3 },
    ];
    expect(countNewEntries(current, previous)).toBe(0);
  });

  it("counts items in current not present in previous", () => {
    const current = [
      { entity_id: "a", count: 10 },
      { entity_id: "b", count: 5 },
      { entity_id: "new1", count: 4 },
      { entity_id: "new2", count: 2 },
    ];
    const previous = [
      { entity_id: "a", count: 8 },
      { entity_id: "b", count: 3 },
    ];
    expect(countNewEntries(current, previous)).toBe(2);
  });

  it("returns all current items as new when previous is empty", () => {
    const current = [
      { entity_id: "a", count: 10 },
      { entity_id: "b", count: 5 },
    ];
    expect(countNewEntries(current, [])).toBe(2);
  });

  it("returns 0 when current is empty", () => {
    const previous = [{ entity_id: "a", count: 5 }];
    expect(countNewEntries([], previous)).toBe(0);
  });
});
