import { describe, it, expect } from "vitest";
import {
  makeAxisScore,
  scoreRange,
  scoreSignal,
  scoreMode,
  selectPrimaryAndBadge,
} from "./compute-taste-axes";
import type { TasteAxes } from "./types";

describe("makeAxisScore", () => {
  it("deviation is |score - 50|", () => {
    expect(makeAxisScore(80).deviation).toBe(30);
    expect(makeAxisScore(20).deviation).toBe(30);
    expect(makeAxisScore(50).deviation).toBe(0);
  });

  it("pole is right when score > 60", () => {
    expect(makeAxisScore(75).pole).toBe("right");
  });

  it("pole is left when score < 40", () => {
    expect(makeAxisScore(25).pole).toBe("left");
  });

  it("pole is neutral between 40–60 inclusive", () => {
    expect(makeAxisScore(50).pole).toBe("neutral");
    expect(makeAxisScore(40).pole).toBe("neutral");
    expect(makeAxisScore(60).pole).toBe("neutral");
  });
});

describe("scoreRange", () => {
  it("returns neutral (50) when totalPlays < 100", () => {
    expect(scoreRange(50, 80).score).toBe(50);
  });

  it("scores Nomad pole when ratio >= 0.45", () => {
    const s = scoreRange(600, 1000); // ratio = 0.6
    expect(s.score).toBeGreaterThan(70);
    expect(s.pole).toBe("right");
  });

  it("scores Devotee pole when ratio <= 0.10", () => {
    const s = scoreRange(80, 1000); // ratio = 0.08
    expect(s.score).toBeLessThan(30);
    expect(s.pole).toBe("left");
  });

  it("scores neutral in mid range", () => {
    const s = scoreRange(250, 1000); // ratio = 0.25
    expect(s.score).toBeGreaterThanOrEqual(30);
    expect(s.score).toBeLessThanOrEqual(70);
  });
});

describe("scoreSignal", () => {
  it("returns null when obscurityScore is null", () => {
    expect(scoreSignal(null)).toBeNull();
  });

  it("scores Cultural Pulse when popularity > 65 (obscurity < 35)", () => {
    // obscurityScore 20 → popularity 80
    const s = scoreSignal(20);
    expect(s).not.toBeNull();
    expect(s!.score).toBeGreaterThan(70);
    expect(s!.pole).toBe("right");
  });

  it("scores Archivist when popularity < 40 (obscurity > 60)", () => {
    // obscurityScore 70 → popularity 30
    const s = scoreSignal(70);
    expect(s).not.toBeNull();
    expect(s!.score).toBeLessThan(30);
    expect(s!.pole).toBe("left");
  });

  it("scores neutral in mid range", () => {
    // obscurityScore 48 → popularity 52
    const s = scoreSignal(48);
    expect(s).not.toBeNull();
    expect(s!.score).toBeGreaterThan(30);
    expect(s!.score).toBeLessThan(70);
  });
});

describe("scoreMode", () => {
  it("scores Session Maximalist when maxWeek >= 350", () => {
    const s = scoreMode(350, 4, 6);
    expect(s.score).toBe(90);
    expect(s.pole).toBe("right");
  });

  it("scores Session Maximalist when maxWeek >= 200", () => {
    const s = scoreMode(250, 4, 6);
    expect(s.score).toBe(80);
  });

  it("scores Daily Ritual when activeRate >= 0.75", () => {
    const s = scoreMode(30, 9, 12); // 9/12 = 0.75
    expect(s.score).toBe(20);
    expect(s.pole).toBe("left");
  });

  it("Sessions takes priority over Ritual", () => {
    const s = scoreMode(350, 10, 12);
    expect(s.score).toBe(90);
  });

  it("returns neutral when neither fires", () => {
    const s = scoreMode(50, 3, 12);
    expect(s.score).toBe(50);
  });
});

describe("selectPrimaryAndBadge", () => {
  it("selects the axis with highest deviation as primary", () => {
    const axes: TasteAxes = {
      range: makeAxisScore(80),      // deviation 30 — highest
      signal: makeAxisScore(25),     // deviation 25
      mode: makeAxisScore(50),       // deviation 0
      discovery: makeAxisScore(55),  // deviation 5
    };
    const result = selectPrimaryAndBadge(axes);
    expect(result.primary).toBe("genre-nomad");
  });

  it("sets badge from second strongest axis if deviation > 15", () => {
    const axes: TasteAxes = {
      range: makeAxisScore(82),   // deviation 32
      signal: makeAxisScore(22),  // deviation 28 — second
      mode: null,
      discovery: null,
    };
    const result = selectPrimaryAndBadge(axes);
    expect(result.primary).toBe("genre-nomad");
    expect(result.badge).toBe("Underground");
  });

  it("returns null badge when second axis deviation <= 15", () => {
    const axes: TasteAxes = {
      range: makeAxisScore(80),
      signal: makeAxisScore(55),  // deviation 5 — too weak
      mode: null,
      discovery: null,
    };
    const result = selectPrimaryAndBadge(axes);
    expect(result.badge).toBeNull();
  });

  it("returns well-rounded when no axis exceeds threshold", () => {
    const axes: TasteAxes = {
      range: makeAxisScore(55),
      signal: makeAxisScore(48),
      mode: makeAxisScore(52),
      discovery: null,
    };
    const result = selectPrimaryAndBadge(axes);
    expect(result.primary).toBe("well-rounded");
    expect(result.badge).toBeNull();
  });
});
