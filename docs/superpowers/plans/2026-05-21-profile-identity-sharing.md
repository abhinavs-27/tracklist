# Profile Identity & Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-winner listening style system with a 4-axis model, add a shareable 1:1 profile identity card, and redesign the profile style widget with an expandable breakdown.

**Architecture:** All 4 axes computed from `user_listening_aggregates` (no raw log scans), results stored in `taste_identity_cache.payload` as a new `styleResult` field. Profile card is a Satori 1080×1080 PNG from a new endpoint. Profile widget gets a collapsed/expanded state with axis bars and inline share button.

**Tech Stack:** TypeScript, Supabase (via admin client), `next/og` (Satori), Vitest, Tailwind CSS, React Server/Client components.

---

## File Map

**New files:**
- `lib/taste/compute-taste-axes.ts` — 4-axis scoring logic, pure + async helpers
- `lib/taste/compute-taste-axes.test.ts` — unit tests for axis math
- `lib/taste/profile-identity-card-template.tsx` — Satori template 1080×1080
- `app/api/profile/identity-card/route.ts` — PNG generation endpoint

**Modified files:**
- `lib/taste/types.ts` — add `AxisScore`, `TasteAxes`, `TasteStyleResult` types; extend `TasteIdentity`
- `lib/taste/listening-style.ts` — new `TasteListeningStyle` keys, copy, badge labels, accent colors
- `lib/taste/taste-identity.ts` — call `computeTasteAxes`, remove `pickListeningStyle`, set `listeningStyle` from result
- `components/profile/taste-identity-display.tsx` — collapsed/expanded widget, share button
- `mobile/components/profile/TasteIdentity.tsx` — display badge, handle new style keys

---

## Task 1: New Types in `lib/taste/types.ts`

**Files:**
- Modify: `lib/taste/types.ts`

- [ ] **Step 1: Add new types after existing exports**

Open `lib/taste/types.ts` and add these types at the bottom of the file, after the existing `TasteIdentity` type:

```typescript
// ── Listening style axis model ────────────────────────────────────────────────

export type AxisScore = {
  /** 0–100; 50 = neutral, 0 = fully left pole, 100 = fully right pole */
  score: number;
  /** |score - 50| — used to pick the strongest axis */
  deviation: number;
  pole: "left" | "right" | "neutral";
};

export type TasteAxes = {
  /** Devotee (0) ↔ Genre Nomad (100) */
  range: AxisScore;
  /** The Archivist (0) ↔ Cultural Pulse (100). null if no Spotify popularity data. */
  signal: AxisScore | null;
  /** Daily Ritual (0) ↔ Session Maximalist (100). null if < 4 weeks of aggregates. */
  mode: AxisScore | null;
  /** The Loyalist (0) ↔ The Explorer (100). null if < 8 weeks history or < 50 recent plays. */
  discovery: AxisScore | null;
};

export type TasteStyleResult = {
  /** Primary identity label — the axis with the highest deviation from neutral */
  primary: import("./listening-style").TasteListeningStyle;
  /** Short badge label for the second-strongest axis, or null */
  badge: string | null;
  /** Full axis breakdown for the profile widget */
  axes: TasteAxes;
};
```

- [ ] **Step 2: Extend `TasteIdentity` to include `styleResult`**

Find the `TasteIdentity` type definition and add one field:

```typescript
export type TasteIdentity = {
  topArtists: TasteTopArtist[];
  topAlbums: TasteTopAlbum[];
  topGenres: TasteGenre[];
  obscurityScore: number | null;
  diversityScore: number;
  listeningStyle: TasteListeningStyle;
  avgTracksPerSession: number;
  totalLogs: number;
  summary: string;
  recent?: TasteRecentSnapshot | null;
  /** 4-axis style breakdown. Populated after taste refresh. null for new users. */
  styleResult?: TasteStyleResult | null;
};
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/taste/types.ts
git commit -m "feat: add AxisScore, TasteAxes, TasteStyleResult types"
```

---

## Task 2: Update `lib/taste/listening-style.ts`

**Files:**
- Modify: `lib/taste/listening-style.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// lib/taste/listening-style.ts
/**
 * Listening style keys, display copy, badge labels, and visual config.
 * Shared between web (lib/) and mobile (via @repo alias in mobile/tsconfig.json).
 */

export type TasteListeningStyle =
  | "genre-nomad"       // Range axis: Nomad pole (high unique_artists/plays ratio)
  | "the-devotee"       // Range axis: Devotee pole (low ratio — tight circle)
  | "cultural-pulse"    // Signal axis: Mainstream pole (high avg track popularity)
  | "the-archivist"     // Signal axis: Underground pole (low avg track popularity)
  | "session-maximalist" // Mode axis: Sessions pole (high max weekly plays)
  | "daily-ritual"      // Mode axis: Ritual pole (consistent week-over-week presence)
  | "the-explorer"      // Discovery axis: Explorer pole (high new-artist ratio)
  | "the-loyalist"      // Discovery axis: Loyalist pole (low new-artist ratio)
  | "well-rounded"      // No strong axis — genuinely balanced
  | "still-forming";    // Informational state only: < 100 total plays

export type StyleCopy = {
  title: string;
  /** Third-person observer voice — like a friend describing your taste to someone else. */
  subtitle: string;
  /** Short badge label when this style appears as a secondary signal */
  badge: string;
};

export const LISTENING_STYLE_COPY: Record<TasteListeningStyle, StyleCopy> = {
  "genre-nomad": {
    title: "Genre Nomad",
    subtitle: "Jazz one week, something completely different the next. Hard to pin down and the range is real.",
    badge: "Nomad",
  },
  "the-devotee": {
    title: "The Devotee",
    subtitle: "Has a handful of artists they actually care about. New stuff comes out and mostly they're going back to the same records.",
    badge: "Devotee",
  },
  "cultural-pulse": {
    title: "Cultural Pulse",
    subtitle: "Listens to a lot of popular music. Knows what's charting and is usually into it.",
    badge: "Mainstream",
  },
  "the-archivist": {
    title: "The Archivist",
    subtitle: "The kind of listener who sends you something you've never heard of, and then three months later everyone has it.",
    badge: "Underground",
  },
  "session-maximalist": {
    title: "Session Maximalist",
    subtitle: "Puts something on and two hours later is still going. Doesn't do background music.",
    badge: "Sessions",
  },
  "daily-ritual": {
    title: "Daily Ritual",
    subtitle: "Music runs through most of the day. Morning, commute, home. It stays on.",
    badge: "Ritual",
  },
  "the-explorer": {
    title: "The Explorer",
    subtitle: "The listening history from two months ago looks almost nothing like today. Moves through new music fast.",
    badge: "Explorer",
  },
  "the-loyalist": {
    title: "The Loyalist",
    subtitle: "Goes back to the same artists again and again. New music is fine but the same ones always win.",
    badge: "Loyalist",
  },
  "well-rounded": {
    title: "Well Rounded",
    subtitle: "No single axis dominates. Broad enough to cover ground, focused enough to go deep.",
    badge: "",
  },
  "still-forming": {
    title: "Still Forming",
    subtitle: "Not enough data yet to say much. The picture fills in over time.",
    badge: "",
  },
};

/** Accent hex color for the share card gradient */
export const STYLE_ACCENT_COLOR: Record<TasteListeningStyle, string> = {
  "genre-nomad":        "#10b981",
  "the-devotee":        "#f59e0b",
  "cultural-pulse":     "#eab308",
  "the-archivist":      "#818cf8",
  "session-maximalist": "#6366f1",
  "daily-ritual":       "#38bdf8",
  "the-explorer":       "#34d399",
  "the-loyalist":       "#fb923c",
  "well-rounded":       "#a1a1aa",
  "still-forming":      "#52525b",
};

/** Labels for the axis breakdown bars */
export const AXIS_DISPLAY: {
  range:     { left: string; right: string };
  signal:    { left: string; right: string };
  mode:      { left: string; right: string };
  discovery: { left: string; right: string };
} = {
  range:     { left: "Devotee", right: "Nomad" },
  signal:    { left: "Underground", right: "Mainstream" },
  mode:      { left: "Ritual", right: "Sessions" },
  discovery: { left: "Loyalist", right: "Explorer" },
};

/** Map legacy string values from old cache payloads to new keys */
const LEGACY_MAP: Record<string, TasteListeningStyle> = {
  "chart-gravity":       "cultural-pulse",
  "deep-cuts-dept":      "the-archivist",
  "album-gravity-well":  "the-devotee",
  "omnivore-mode":       "genre-nomad",
  "mainstay-mode":       "the-loyalist",
  "steady-rhythm":       "daily-ritual",
  "session-maximalist":  "session-maximalist",
  "plotting-the-plot":   "still-forming",
  // Even older pre-v2 labels
  casual:            "still-forming",
  mainstream:        "cultural-pulse",
  "crate digger":    "the-archivist",
  "deep listener":   "the-devotee",
  explorer:          "genre-nomad",
  "binge listener":  "session-maximalist",
};

export function normalizeListeningStyle(raw: string | undefined | null): TasteListeningStyle {
  if (!raw || typeof raw !== "string") return "still-forming";
  const trimmed = raw.trim();
  if (trimmed in LISTENING_STYLE_COPY) return trimmed as TasteListeningStyle;
  if (trimmed in LEGACY_MAP) return LEGACY_MAP[trimmed]!;
  return "still-forming";
}

export function getListeningStyleDisplay(style: TasteListeningStyle): StyleCopy {
  return LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["still-forming"];
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors (old callers of `getListeningStyleDisplay` still work — same function signature returning `{ title, subtitle }`; the added `badge` field is backward-compatible).

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/taste/listening-style.ts
git commit -m "feat: new listening style labels, copy, badge labels, axis display names"
```

---

## Task 3: `compute-taste-axes.ts` with TDD

**Files:**
- Create: `lib/taste/compute-taste-axes.ts`
- Create: `lib/taste/compute-taste-axes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/taste/compute-taste-axes.test.ts
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

  it("pole is neutral between 40–60", () => {
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
    // High weekly plays AND high active rate
    const s = scoreMode(350, 10, 12);
    expect(s.score).toBe(90); // Sessions wins
  });

  it("returns neutral when neither fires", () => {
    const s = scoreMode(50, 3, 12); // low plays, low active rate
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
    expect(result.primary).toBe("genre-nomad"); // range right pole
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
    expect(result.badge).toBe("Underground"); // signal left pole badge
  });

  it("returns null badge when second axis deviation <= 15", () => {
    const axes: TasteAxes = {
      range: makeAxisScore(80),   // deviation 30
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:unit -- lib/taste/compute-taste-axes.test.ts
```

Expected: FAIL — "Cannot find module './compute-taste-axes'"

- [ ] **Step 3: Implement `compute-taste-axes.ts`**

```typescript
// lib/taste/compute-taste-axes.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxisScore, TasteAxes, TasteStyleResult } from "./types";
import type { TasteListeningStyle } from "./listening-style";
import { getAllTimeAgg, getTotalPlayCount } from "@/lib/analytics/from-aggregates";

// ── Core primitive ────────────────────────────────────────────────────────────

export function makeAxisScore(score: number): AxisScore {
  const s = Math.round(Math.min(100, Math.max(0, score)));
  return {
    score: s,
    deviation: Math.abs(s - 50),
    pole: s > 60 ? "right" : s < 40 ? "left" : "neutral",
  };
}

// ── Axis 1: RANGE (Devotee ↔ Genre Nomad) ────────────────────────────────────

/**
 * Pure scoring — separated from DB fetch for testability.
 * @param uniqueArtists  count of distinct artists in all-time aggregates
 * @param totalPlays     sum of all track plays
 */
export function scoreRange(uniqueArtists: number, totalPlays: number): AxisScore {
  if (totalPlays < 100) return makeAxisScore(50);
  const ratio = uniqueArtists / totalPlays;
  let score: number;
  if (ratio >= 0.45) {
    score = 70 + Math.min(30, ((ratio - 0.45) / 0.55) * 30);
  } else if (ratio <= 0.10) {
    score = 30 - Math.min(30, ((0.10 - ratio) / 0.10) * 30);
  } else {
    score = 30 + ((ratio - 0.10) / 0.35) * 40;
  }
  return makeAxisScore(score);
}

async function computeRangeAxis(admin: SupabaseClient, userId: string): Promise<AxisScore> {
  const [artistAgg, totalPlays] = await Promise.all([
    getAllTimeAgg(admin, userId, "artist", 2000),
    getTotalPlayCount(admin, userId),
  ]);
  return scoreRange(artistAgg.length, totalPlays);
}

// ── Axis 2: SIGNAL (The Archivist ↔ Cultural Pulse) ──────────────────────────

/**
 * Derived from obscurityScore (0–100) already computed in computeTasteIdentity.
 * obscurityScore = 100 - avgTrackPopularity, so high obscurity = underground.
 */
export function scoreSignal(obscurityScore: number | null): AxisScore | null {
  if (obscurityScore === null) return null;
  const popularity = 100 - obscurityScore; // convert back to 0–100 popularity
  let score: number;
  if (popularity > 65) {
    score = 70 + Math.min(30, ((popularity - 65) / 35) * 30);
  } else if (popularity < 40) {
    score = 30 - Math.min(30, ((40 - popularity) / 40) * 30);
  } else {
    score = 30 + ((popularity - 40) / 25) * 40;
  }
  return makeAxisScore(score);
}

// ── Axis 3: MODE (Daily Ritual ↔ Session Maximalist) ─────────────────────────

/**
 * Pure scoring — separated for testability.
 * @param maxWeeklyPlays  highest track play count across any single week
 * @param activeWeeks     number of weeks with at least 1 play
 * @param totalWeeks      total weeks checked (up to 12)
 */
export function scoreMode(
  maxWeeklyPlays: number,
  activeWeeks: number,
  totalWeeks: number,
): AxisScore {
  // Sessions scoring
  let sessionScore = 50;
  if (maxWeeklyPlays >= 350) sessionScore = 90;
  else if (maxWeeklyPlays >= 200) sessionScore = 80;
  else if (maxWeeklyPlays >= 100) sessionScore = 70;

  // Sessions takes priority
  if (sessionScore >= 80) return makeAxisScore(sessionScore);

  // Ritual scoring
  const activeRate = totalWeeks > 0 ? activeWeeks / totalWeeks : 0;
  if (activeRate >= 0.75) return makeAxisScore(20);
  if (activeRate >= 0.60) return makeAxisScore(30);

  return makeAxisScore(50);
}

async function computeModeAxis(
  admin: SupabaseClient,
  userId: string,
): Promise<AxisScore | null> {
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setUTCDate(twelveWeeksAgo.getUTCDate() - 84);
  const cutoff = twelveWeeksAgo.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("week_start, count")
    .eq("user_id", userId)
    .eq("entity_type", "track")
    .gte("week_start", cutoff)
    .not("week_start", "is", null);

  if (error || !data?.length) return null;

  const rows = data as Array<{ week_start: string; count: number }>;

  // Group by week, sum plays
  const weekTotals = new Map<string, number>();
  for (const r of rows) {
    weekTotals.set(r.week_start, (weekTotals.get(r.week_start) ?? 0) + r.count);
  }

  if (weekTotals.size < 4) return null;

  const weekValues = Array.from(weekTotals.values());
  const maxWeeklyPlays = Math.max(...weekValues);
  const activeWeeks = weekValues.filter((v) => v > 0).length;
  const totalWeeks = Math.min(12, weekTotals.size);

  return scoreMode(maxWeeklyPlays, activeWeeks, totalWeeks);
}

// ── Axis 4: DISCOVERY (The Loyalist ↔ The Explorer) ──────────────────────────

async function computeDiscoveryAxis(
  admin: SupabaseClient,
  userId: string,
): Promise<AxisScore | null> {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);
  const cutoff4w = fourWeeksAgo.toISOString().slice(0, 10);

  // Check we have at least 8 weeks of aggregate history
  const { data: earliest } = await admin
    .from("user_listening_aggregates")
    .select("week_start")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .not("week_start", "is", null)
    .order("week_start", { ascending: true })
    .limit(1);

  if (!earliest?.length) return null;

  const earliestDate = new Date((earliest[0] as { week_start: string }).week_start);
  const weeksSince = Math.floor((Date.now() - earliestDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (weeksSince < 8) return null;

  // Get all artist plays in last 4 weeks
  const { data: recentPlays } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, count")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .gte("week_start", cutoff4w)
    .not("week_start", "is", null);

  const recentRows = (recentPlays ?? []) as Array<{ entity_id: string; count: number }>;
  const totalRecentPlays = recentRows.reduce((s, r) => s + r.count, 0);
  if (totalRecentPlays < 50) return null;

  const recentArtistIds = [...new Set(recentRows.map((r) => r.entity_id))];
  if (recentArtistIds.length === 0) return null;

  // Get the first week each of those artists appeared in the user's history
  const { data: allEncounters } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, week_start")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .in("entity_id", recentArtistIds)
    .not("week_start", "is", null)
    .order("week_start", { ascending: true });

  // MIN(week_start) per artist
  const firstWeekByArtist = new Map<string, string>();
  for (const r of (allEncounters ?? []) as Array<{ entity_id: string; week_start: string }>) {
    const existing = firstWeekByArtist.get(r.entity_id);
    if (!existing || r.week_start < existing) {
      firstWeekByArtist.set(r.entity_id, r.week_start);
    }
  }

  // Artists whose first encounter falls within the last 4 weeks = newly discovered
  const newArtistIds = new Set(
    Array.from(firstWeekByArtist.entries())
      .filter(([, first]) => first >= cutoff4w)
      .map(([id]) => id),
  );

  const newArtistPlays = recentRows
    .filter((r) => newArtistIds.has(r.entity_id))
    .reduce((s, r) => s + r.count, 0);

  const ratio = newArtistPlays / totalRecentPlays;

  let score: number;
  if (ratio > 0.35) {
    score = 70 + Math.min(30, ((ratio - 0.35) / 0.65) * 30);
  } else if (ratio < 0.05) {
    score = 30 - Math.min(30, ((0.05 - ratio) / 0.05) * 30);
  } else {
    score = 30 + ((ratio - 0.05) / 0.30) * 40;
  }

  return makeAxisScore(score);
}

// ── Primary + badge selection ─────────────────────────────────────────────────

type AxisCandidate = {
  axis: AxisScore;
  style: TasteListeningStyle;
  badge: string;
};

function axisToCandidate(
  axisScore: AxisScore,
  axisName: keyof TasteAxes,
): AxisCandidate | null {
  if (axisScore.deviation <= 15) return null;
  const { pole } = axisScore;
  const map: Record<keyof TasteAxes, [TasteListeningStyle, string, TasteListeningStyle, string]> = {
    range:     ["the-devotee",       "Devotee",    "genre-nomad",       "Nomad"],
    signal:    ["the-archivist",     "Underground","cultural-pulse",    "Mainstream"],
    mode:      ["daily-ritual",      "Ritual",     "session-maximalist","Sessions"],
    discovery: ["the-loyalist",      "Loyalist",   "the-explorer",      "Explorer"],
  };
  const [leftStyle, leftBadge, rightStyle, rightBadge] = map[axisName];
  if (pole === "left")  return { axis: axisScore, style: leftStyle,  badge: leftBadge };
  if (pole === "right") return { axis: axisScore, style: rightStyle, badge: rightBadge };
  return null;
}

export function selectPrimaryAndBadge(axes: TasteAxes): {
  primary: TasteListeningStyle;
  badge: string | null;
} {
  const candidates: AxisCandidate[] = [];
  for (const [name, axis] of Object.entries(axes) as [keyof TasteAxes, AxisScore | null][]) {
    if (!axis) continue;
    const c = axisToCandidate(axis, name);
    if (c) candidates.push(c);
  }

  if (candidates.length === 0) return { primary: "well-rounded", badge: null };

  candidates.sort((a, b) => b.axis.deviation - a.axis.deviation);

  const primary = candidates[0]!.style;
  const second = candidates[1];
  const badge = second && second.axis.deviation > 15 ? second.badge : null;

  return { primary, badge };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function computeTasteAxes(
  admin: SupabaseClient,
  userId: string,
  obscurityScore: number | null,
): Promise<TasteStyleResult> {
  const [range, mode, discovery] = await Promise.all([
    computeRangeAxis(admin, userId),
    computeModeAxis(admin, userId),
    computeDiscoveryAxis(admin, userId),
  ]);

  const signal = scoreSignal(obscurityScore);

  const axes: TasteAxes = { range, signal, mode, discovery };
  const { primary, badge } = selectPrimaryAndBadge(axes);

  return { primary, badge, axes };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:unit -- lib/taste/compute-taste-axes.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/taste/compute-taste-axes.ts lib/taste/compute-taste-axes.test.ts
git commit -m "feat: 4-axis taste style computation with unit tests"
```

---

## Task 4: Wire Axes into `lib/taste/taste-identity.ts`

**Files:**
- Modify: `lib/taste/taste-identity.ts`

- [ ] **Step 1: Add import**

At the top of `lib/taste/taste-identity.ts`, add:

```typescript
import { computeTasteAxes } from "./compute-taste-axes";
```

- [ ] **Step 2: Call `computeTasteAxes` inside `computeTasteIdentity`**

In `computeTasteIdentity`, after `obscurityScore` is computed (around line 1104), add:

```typescript
  // Compute 4-axis style result from aggregates + obscurityScore
  const styleResult = await computeTasteAxes(admin, userId, obscurityScore);
```

- [ ] **Step 3: Set `listeningStyle` from `styleResult` and include in return**

Find the `base` object construction near the end of `computeTasteIdentity` (the object with `topArtists`, `topAlbums`, etc.) and update it:

```typescript
  const base: TasteIdentity = {
    topArtists,
    topAlbums,
    topGenres,
    obscurityScore,
    diversityScore,
    listeningStyle: styleResult.primary,  // was: pickListeningStyle(...)
    avgTracksPerSession,
    totalLogs,
    summary: "",
    styleResult,                           // new field
  };
```

- [ ] **Step 4: Remove `pickListeningStyle` call and function**

Delete the `pickListeningStyle` function (lines 83–206 in the original file) and its call site. The style is now determined by `computeTasteAxes`.

- [ ] **Step 5: Update `seedTasteIdentityFromFavoriteAlbums` to use "still-forming"**

Find the cold-start payload in `seedTasteIdentityFromFavoriteAlbums` and change its `listeningStyle`:

```typescript
  const payload: TasteIdentity = {
    topArtists,
    topAlbums,
    topGenres,
    obscurityScore: null,
    diversityScore,
    listeningStyle: "still-forming",  // was: "plotting-the-plot"
    avgTracksPerSession: 1,
    totalLogs: 0,
    summary,
    styleResult: null,
  };
```

- [ ] **Step 6: Update `normalizeCachedTasteIdentity` cold-start check**

Find the cold-start summary check referencing `EMPTY.summary` and update the listeningStyle reference if needed. The normalized style must handle "still-forming" from `normalizeListeningStyle`.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Run all unit tests**

```bash
npm run test:unit
```

Expected: all tests pass (the compute-taste-axes tests + existing tests).

- [ ] **Step 9: Commit**

```bash
git add lib/taste/taste-identity.ts
git commit -m "feat: wire computeTasteAxes into taste identity refresh, remove pickListeningStyle"
```

---

## Task 5: Profile Identity Card Satori Template

**Files:**
- Create: `lib/taste/profile-identity-card-template.tsx`

**Satori constraints (must follow):**
- All styles are inline objects — no Tailwind, no CSS class names
- No `filter: blur()` — not supported
- No `inset` CSS shorthand — use explicit `top`, `right`, `bottom`, `left`
- All `<div>` elements with children need explicit `display: "flex"`
- Remote images use `<img src={url}>` (not next/image)

- [ ] **Step 1: Create the template**

```typescript
// lib/taste/profile-identity-card-template.tsx

import { LISTENING_STYLE_COPY, STYLE_ACCENT_COLOR } from "./listening-style";
import type { TasteListeningStyle } from "./listening-style";
import type { TasteGenre } from "./types";

export type ProfileIdentityCardProps = {
  style: TasteListeningStyle;
  badge: string | null;
  topGenres: TasteGenre[];
  obscurityScore: number | null;
  usernameDisplay: string | null;
  /** Top artist image URL for subtle background tint */
  topArtistImageUrl?: string | null;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function ProfileIdentityCardTemplate({
  style,
  badge,
  topGenres,
  obscurityScore,
  usernameDisplay,
}: ProfileIdentityCardProps) {
  const copy = LISTENING_STYLE_COPY[style] ?? LISTENING_STYLE_COPY["still-forming"];
  const accent = STYLE_ACCENT_COLOR[style] ?? "#10b981";
  const accentLight = `${accent}44`; // 27% opacity hex suffix
  const accentFaint = `${accent}22`; // 13% opacity

  const W = 1080;
  const H = 1080;
  const PAD = 72;

  const bg = [
    `radial-gradient(ellipse 140% 90% at 80% -10%, ${accentLight} 0%, transparent 52%)`,
    `radial-gradient(ellipse 110% 75% at -10% 90%, ${accentFaint} 0%, transparent 55%)`,
    "linear-gradient(160deg, #070707 0%, #09090b 45%, #050505 100%)",
  ].join(", ");

  const titleFontSize = copy.title.length > 16 ? 88 : copy.title.length > 12 ? 96 : 108;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        backgroundImage: bg,
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#fafafa",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Edge vignette */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          height: 88,
          paddingLeft: PAD,
          paddingRight: PAD,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: accent,
            textTransform: "uppercase",
          }}
        >
          Tracklist
        </span>
        <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)", fontWeight: 400 }}>
          {usernameDisplay ? `@${truncate(usernameDisplay, 22)}` : ""}
        </span>
      </div>

      {/* Center content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          paddingLeft: PAD,
          paddingRight: PAD,
          position: "relative",
          gap: 0,
        }}
      >
        {/* Style label */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 4,
              color: accent,
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Listening Style
          </span>
          <span
            style={{
              fontSize: titleFontSize,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: -3,
              lineHeight: 1.0,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {copy.title}
          </span>

          {/* Badge pill */}
          {badge ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 24,
                backgroundColor: `${accent}18`,
                border: `1px solid ${accent}38`,
                borderRadius: 999,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 22,
                paddingRight: 22,
              }}
            >
              <span style={{ fontSize: 16, color: `${accent}dd`, fontWeight: 600 }}>
                {badge}
              </span>
            </div>
          ) : null}

          {/* Subtitle */}
          <span
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.42)",
              textAlign: "center",
              marginTop: badge ? 20 : 24,
              maxWidth: 820,
              lineHeight: 1.45,
              fontWeight: 400,
            }}
          >
            {truncate(copy.subtitle, 120)}
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: PAD,
          paddingRight: PAD,
          paddingBottom: 52,
          paddingTop: 28,
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.055)",
          gap: 16,
          position: "relative",
        }}
      >
        {/* Genre tags */}
        {topGenres.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "row", gap: 12 }}>
            {topGenres.slice(0, 3).map((g) => (
              <div
                key={g.name}
                style={{
                  display: "flex",
                  paddingTop: 7,
                  paddingBottom: 7,
                  paddingLeft: 18,
                  paddingRight: 18,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Obscurity line */}
        {obscurityScore !== null && obscurityScore > 0 ? (
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
            {`More obscure than ${Math.min(obscurityScore, 99)}% of listeners`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/taste/profile-identity-card-template.tsx
git commit -m "feat: ProfileIdentityCardTemplate — 1080×1080 Satori identity card"
```

---

## Task 6: Identity Card API Route

**Files:**
- Create: `app/api/profile/identity-card/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/profile/identity-card/route.ts
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiInternalError, apiNotFound, apiBadRequest } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { loadChartShareImageFonts } from "@/lib/charts/chart-share-image-fonts";
import {
  ProfileIdentityCardTemplate,
} from "@/lib/taste/profile-identity-card-template";

export const maxDuration = 60;

/**
 * GET /api/profile/identity-card
 * Returns a 1080×1080 PNG of the user's listening style identity card.
 * Auth required — own profile only.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiAuth(request);

    const identity = await getTasteIdentity(user.id);

    if (!identity.styleResult || identity.styleResult.primary === "still-forming") {
      return apiBadRequest("Not enough listening history to generate a style card yet.");
    }

    const topArtistImageUrl =
      identity.topArtists.find((a) => a.imageUrl)?.imageUrl ?? null;

    const fonts = await loadChartShareImageFonts();

    const response = new ImageResponse(
      <ProfileIdentityCardTemplate
        style={identity.styleResult.primary}
        badge={identity.styleResult.badge}
        topGenres={identity.topGenres}
        obscurityScore={identity.obscurityScore}
        usernameDisplay={user.username ?? null}
        topArtistImageUrl={topArtistImageUrl}
      />,
      {
        width: 1080,
        height: 1080,
        ...(fonts.length > 0 ? { fonts } : {}),
      },
    );

    response.headers.set(
      "Cache-Control",
      "private, max-age=3600, stale-while-revalidate=86400",
    );
    return response;
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Start dev server and test the endpoint manually**

```bash
npm run dev
```

Visit `http://127.0.0.1:3000/api/profile/identity-card` while signed in. Expected: a 1080×1080 PNG downloads or displays. If `styleResult` is null (taste identity not yet refreshed), expect a 400 with the "not enough history" message.

To force a refresh for testing: call `refreshTasteIdentityCacheForUser` for your user ID or trigger the taste-identity cron.

- [ ] **Step 4: Commit**

```bash
git add "app/api/profile/identity-card/route.ts"
git commit -m "feat: GET /api/profile/identity-card — 1080×1080 PNG identity share card"
```

---

## Task 7: Redesign Profile Style Widget

**Files:**
- Modify: `components/profile/taste-identity-display.tsx`

The listening style section is currently a simple card at the bottom (around lines 278–287). Replace it with a collapsed/expanded widget that includes the axis breakdown and share button.

- [ ] **Step 1: Add a new client component `TasteStyleWidget` to the file**

The file currently doesn't have `"use client"` — check first:

```bash
head -3 components/profile/taste-identity-display.tsx
```

If it lacks `"use client"`, extract `TasteStyleWidget` into a separate new file `components/profile/taste-style-widget.tsx` that IS a client component. The parent `taste-identity-display.tsx` remains a server component and passes data to `TasteStyleWidget`.

Create `components/profile/taste-style-widget.tsx`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import {
  getListeningStyleDisplay,
  STYLE_ACCENT_COLOR,
  AXIS_DISPLAY,
  normalizeListeningStyle,
} from "@/lib/taste/listening-style";
import type { TasteStyleResult } from "@/lib/taste/types";
import type { TasteListeningStyle } from "@/lib/taste/listening-style";

async function fetchIdentityPng(): Promise<File> {
  const res = await fetch("/api/profile/identity-card", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? "Could not generate card");
  }
  const blob = await res.blob();
  return new File([blob], "tracklist-identity.png", { type: "image/png" });
}

function detectShareCapability(): "native-files" | "download" {
  if (typeof navigator === "undefined") return "download";
  if (!/mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent)) return "download";
  try {
    if (navigator.canShare?.({ files: [new File([], "t.png", { type: "image/png" })] }))
      return "native-files";
  } catch { /* ignore */ }
  return "download";
}

type AxisBarProps = {
  label: string;
  leftLabel: string;
  rightLabel: string;
  score: number | null;   // null = unavailable
  pole: "left" | "right" | "neutral" | null;
};

function AxisBar({ label, leftLabel, rightLabel, score, pole }: AxisBarProps) {
  if (score === null) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="w-24 shrink-0 text-zinc-600">{label}</span>
        <span className="text-zinc-700 italic">unavailable</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, score));
  const poleLabel = pole === "left" ? leftLabel : pole === "right" ? rightLabel : "—";

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-zinc-800">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <span className={`w-20 shrink-0 text-right ${pole === "neutral" ? "text-zinc-700" : "text-zinc-400"}`}>
        {poleLabel}
      </span>
    </div>
  );
}

type Props = {
  styleKey: TasteListeningStyle;
  styleResult: TasteStyleResult | null | undefined;
  totalLogs: number;
  totalArtists: number;
  isOwnProfile: boolean;
};

export function TasteStyleWidget({
  styleKey,
  styleResult,
  totalLogs,
  totalArtists,
  isOwnProfile,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCapability = useRef(detectShareCapability());
  const { toast } = useToast();
  const copy = getListeningStyleDisplay(styleKey);
  const accent = STYLE_ACCENT_COLOR[styleKey] ?? "#10b981";

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await fetchIdentityPng();
      if (shareCapability.current === "native-files") {
        await navigator.share({ files: [file], title: "My listening style on Tracklist" });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Image downloaded");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast(e instanceof Error ? e.message : "Could not generate card");
    } finally {
      setSharing(false);
    }
  }, [sharing, toast]);

  const axes = styleResult?.axes;

  return (
    <div
      className="rounded-xl border px-4 py-4"
      style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0a` }}
    >
      {/* Collapsed header */}
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: `${accent}e6` }}>
        Listening style
      </p>

      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {copy.title}
          </p>
          {styleResult?.badge ? (
            <span
              className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${accent}18`,
                border: `1px solid ${accent}30`,
                color: `${accent}dd`,
              }}
            >
              {styleResult.badge}
            </span>
          ) : null}
        </div>

        {isOwnProfile ? (
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={sharing}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            {sharing ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
            {sharing ? "Generating…" : "Share"}
          </button>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm leading-snug text-zinc-400">{copy.subtitle}</p>

      {/* Expand/collapse */}
      {axes ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[11px] text-zinc-600 transition hover:text-zinc-400"
          >
            {expanded ? "Hide breakdown ↑" : "Show breakdown ↓"}
          </button>

          {expanded ? (
            <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
              <AxisBar
                label="Range"
                leftLabel={AXIS_DISPLAY.range.left}
                rightLabel={AXIS_DISPLAY.range.right}
                score={axes.range.score}
                pole={axes.range.pole}
              />
              <AxisBar
                label="Discovery"
                leftLabel={AXIS_DISPLAY.discovery.left}
                rightLabel={AXIS_DISPLAY.discovery.right}
                score={axes.discovery?.score ?? null}
                pole={axes.discovery?.pole ?? null}
              />
              <AxisBar
                label="Mode"
                leftLabel={AXIS_DISPLAY.mode.left}
                rightLabel={AXIS_DISPLAY.mode.right}
                score={axes.mode?.score ?? null}
                pole={axes.mode?.pole ?? null}
              />
              <AxisBar
                label="Signal"
                leftLabel={AXIS_DISPLAY.signal.left}
                rightLabel={AXIS_DISPLAY.signal.right}
                score={axes.signal?.score ?? null}
                pole={axes.signal?.pole ?? null}
              />
              <p className="pt-1 text-[10px] text-zinc-700">
                Based on {totalLogs.toLocaleString()} plays across {totalArtists.toLocaleString()} artists
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Replace the listening style section in `taste-identity-display.tsx`**

Find the existing listening style block (the `{t.totalLogs > 0 ? (...)  : null}` block at the bottom) and replace it:

```tsx
import { TasteStyleWidget } from "@/components/profile/taste-style-widget";

// ... inside the component, replace the listening style block:

{hasAny ? (
  <TasteStyleWidget
    styleKey={styleKey}
    styleResult={t.styleResult}
    totalLogs={t.totalLogs}
    totalArtists={t.topArtists.length}
    isOwnProfile={hubMode}  // hubMode = true only on own profile home page
  />
) : null}
```

Note: `isOwnProfile` needs to be threaded through from wherever `taste-identity-display.tsx` is called. Check the component's Props type and add `isOwnProfile?: boolean` if not already present.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify**

```bash
npm run dev
```

Navigate to your profile page. Verify:
- The listening style card shows with the new label and subtitle copy
- Badge appears if `styleResult.badge` is present
- "Show breakdown ↓" button is visible
- Clicking it expands to show axis bars
- "Share" button is visible on own profile
- Clicking Share triggers the share flow

- [ ] **Step 5: Commit**

```bash
git add components/profile/taste-style-widget.tsx components/profile/taste-identity-display.tsx
git commit -m "feat: TasteStyleWidget — collapsed/expanded axis breakdown with inline share"
```

---

## Task 8: Update Mobile `TasteIdentity.tsx`

**Files:**
- Modify: `mobile/components/profile/TasteIdentity.tsx`

The mobile component already imports `getListeningStyleDisplay` and `normalizeListeningStyle` from `@repo/lib/taste/listening-style` — which resolves to the shared `lib/taste/listening-style.ts` file we updated in Task 2. The new keys are already in the shared module.

- [ ] **Step 1: Find and update the style display section**

Read the file to find where `styleDisplay` is used:

```bash
grep -n "styleDisplay\|styleKey\|badge\|listeningStyle" mobile/components/profile/TasteIdentity.tsx
```

- [ ] **Step 2: Add badge display after the style title**

Find the section that renders `styleDisplay.title` and `styleDisplay.subtitle`. After the title, add the badge if available:

```typescript
// After rendering styleDisplay.title, add:
{t.styleResult?.badge ? (
  <View style={{
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    backgroundColor: "rgba(16,185,129,0.1)",
  }}>
    <Text style={{ fontSize: 11, fontWeight: "600", color: "#6ee7b7" }}>
      {t.styleResult.badge}
    </Text>
  </View>
) : null}
```

Note: `t` is the `TasteIdentity` object. Access badge via `t.styleResult?.badge`.

- [ ] **Step 3: Handle "still-forming" state**

The old `"plotting-the-plot"` key is now `"still-forming"` via the legacy map in `normalizeListeningStyle`. Verify the mobile still-forming display works (it should show "Still Forming" title and appropriate subtitle). No code change needed if `normalizeListeningStyle` handles it.

- [ ] **Step 4: Typecheck the mobile project**

```bash
npx tsc --noEmit 2>&1 | grep "TasteIdentity\|listening-style\|styleResult" | grep -v "node_modules" | head -10
```

Expected: no errors related to the changed files.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/profile/TasteIdentity.tsx
git commit -m "feat: mobile TasteIdentity shows badge from new axis model"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1 — `AxisScore`, `TasteAxes`, `TasteStyleResult` types + `TasteIdentity.styleResult`
- ✅ Task 2 — Updated `TasteListeningStyle` keys, copy, badge labels, accent colors, axis display names
- ✅ Task 3 — `computeTasteAxes` with all 4 axes + full unit test coverage
- ✅ Task 4 — Wired into `refreshTasteIdentityCacheForUser`, removed old `pickListeningStyle`
- ✅ Task 5 — Satori 1080×1080 template with correct Satori constraints
- ✅ Task 6 — `GET /api/profile/identity-card` PNG endpoint
- ✅ Task 7 — Collapsed/expanded widget with axis bars + inline share button (mobile web only)
- ✅ Task 8 — Mobile badge display

**Notes for implementer:**
- Task 4 Step 4 (remove `pickListeningStyle`) should be done carefully — search for any remaining callers before deleting the function.
- Task 7: `isOwnProfile` threading may require reading the full Props chain in `taste-identity-display.tsx`. Check `hubMode` — it's passed in some contexts to mean "home page / own profile."
- The `user_listening_aggregates` table has rows with `week_start = null` (all-time aggregates) and rows with specific `week_start` dates (weekly aggregates). The axis queries MUST filter `.not("week_start", "is", null)` for weekly queries (Mode, Discovery) and SHOULD use `getAllTimeAgg` helper for Range (which uses null week_start rows).
- Satori in Task 5: test locally with `npm run dev` and visiting the endpoint — Satori errors appear in the Next.js terminal output.
