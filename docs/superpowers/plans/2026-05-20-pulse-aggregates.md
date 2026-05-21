# Pulse Insights Aggregates Fast Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last raw-log scan in the home bundle pulse computation with aggregates, and bump the pulse cache TTL from 90s to 5 minutes.

**Architecture:** `listeningWindowStats` in `lib/profile/profile-pulse.ts` currently fetches up to 12,000 raw log rows twice per cold pulse request. It's replaced with two aggregates queries (track counts for playCount, artist entity count for uniqueArtists) plus a targeted top-50 track popularity lookup. Call sites switch from rolling ISO bounds to `currentWeekStart()`/`previousWeekStart()`. The cache TTL for pulse specifically bumps to 300s in `lib/profile/cached-profile-data.ts`.

**Tech Stack:** TypeScript, Supabase PostgREST, Next.js `unstable_cache`.

**Spec:** `docs/superpowers/specs/2026-05-20-pulse-aggregates-design.md`

---

## File Map

| File | Change |
|------|--------|
| `lib/profile/profile-pulse.ts` | Replace `listeningWindowStats` with aggregates version; update 2 call sites |
| `lib/profile/cached-profile-data.ts` | Add `PULSE_REVALIDATE_SEC = 300`; apply to `getCachedProfilePulseInsights` |

---

## Task 1: Replace `listeningWindowStats` with aggregates

**Files:**
- Modify: `lib/profile/profile-pulse.ts`

**Context you need:**

`currentWeekStart()` and `previousWeekStart()` are exported from `lib/analytics/from-aggregates.ts` and return `"YYYY-MM-DD"` Monday UTC strings. They are already imported in `lib/analytics/getRollingReportsCompare.ts`; add them to the `profile-pulse.ts` import.

The current `listeningWindowStats` signature:
```typescript
async function listeningWindowStats(
  userId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<WindowStats>
```

The new signature (weekStart replaces the two ISO bounds):
```typescript
async function listeningWindowStats(
  userId: string,
  weekStart: string,  // "YYYY-MM-DD" Monday UTC
): Promise<WindowStats>
```

`fetchPopularityMap` already exists in the file and takes `trackIds: string[]` — reuse it.

`getWeeklyAgg` is already imported from `lib/analytics/from-aggregates.ts` and returns `{ entity_id: string; count: number }[]` from `user_listening_aggregates` for a given user/entity_type/weekStart.

- [ ] **Step 1: Read the current file to locate exact lines**

```bash
grep -n "listeningWindowStats\|import.*from-aggregates\|currentWeekStart\|previousWeekStart\|getRolling7dVsPrior7dBounds" lib/profile/profile-pulse.ts
```

Expected: import line for `from-aggregates` (line ~3), `listeningWindowStats` definition (~line 93), two call sites (~lines 297-298), rolling bounds call (~line 277).

- [ ] **Step 2: Add `currentWeekStart` and `previousWeekStart` to the `from-aggregates` import**

Current import (around line 3):
```typescript
import { currentWeekStart, getWeeklyAgg } from "@/lib/analytics/from-aggregates";
```

Change to:
```typescript
import { currentWeekStart, previousWeekStart, getWeeklyAgg } from "@/lib/analytics/from-aggregates";
```

- [ ] **Step 3: Replace `listeningWindowStats` with the aggregates version**

Find the full function (from `async function listeningWindowStats` through its closing `}`). Replace it entirely with:

```typescript
async function listeningWindowStats(
  userId: string,
  weekStart: string,  // "YYYY-MM-DD" Monday UTC
): Promise<WindowStats> {
  const admin = createSupabaseAdminClient();
  const ZERO: WindowStats = { playCount: 0, avgPopularity: null, popSamples: 0, uniqueArtists: 0 };

  const [trackRows, artistRows] = await Promise.all([
    getWeeklyAgg(admin, userId, "track",  weekStart, 50),
    getWeeklyAgg(admin, userId, "artist", weekStart, 500),
  ]);

  if (trackRows.length === 0 && artistRows.length === 0) return ZERO;

  const playCount     = trackRows.reduce((s, r) => s + r.count, 0);
  const uniqueArtists = artistRows.length;

  // Popularity: batch-lookup top 50 tracks by play count (already sorted desc by getWeeklyAgg)
  const topTrackIds = trackRows.slice(0, 50).map((r) => r.entity_id);
  const popMap      = await fetchPopularityMap(topTrackIds);

  let sum  = 0;
  let nPop = 0;
  for (const row of trackRows.slice(0, 50)) {
    const p = popMap.get(row.entity_id);
    if (p != null) { sum += p * row.count; nPop += row.count; }
  }

  return {
    playCount,
    avgPopularity: nPop > 0 ? sum / nPop : null,
    popSamples:    nPop,
    uniqueArtists,
  };
}
```

Note: `avgPopularity` is now weighted by play count (more accurate — a track played 10 times contributes 10x to the average). `popSamples` is the number of plays (not unique tracks) with popularity data, consistent with the weighted formula.

- [ ] **Step 4: Update the two `listeningWindowStats` call sites in `getProfilePulseInsights`**

Find (around line 277):
```typescript
const { current, previous } = getRolling7dVsPrior7dBounds();
```

And (around lines 297-298):
```typescript
listeningWindowStats(uid, current.startIso, current.endExclusiveIso),
listeningWindowStats(uid, previous.startIso, previous.endExclusiveIso),
```

Replace those two call lines with:
```typescript
listeningWindowStats(uid, currentWeekStart()),
listeningWindowStats(uid, previousWeekStart()),
```

The `const { current, previous } = getRolling7dVsPrior7dBounds();` line is still used by other sub-calls in the same `Promise.all` (for `getListeningReportsRollingCompare` and `getTopArtistIdsForLogWindow`), so keep it. Only the `listeningWindowStats` calls change.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 6: Commit**

```bash
git add lib/profile/profile-pulse.ts
git commit -m "perf: listeningWindowStats reads from user_listening_aggregates (was 12K log scan)"
```

---

## Task 2: Bump pulse cache TTL to 5 minutes

**Files:**
- Modify: `lib/profile/cached-profile-data.ts`

**Context:** `REVALIDATE_SEC = 90` is used by all cached profile functions. We add a separate constant for pulse only — the pulse shows weekly data and doesn't need sub-2-minute refresh.

- [ ] **Step 1: Read the constants section**

```bash
head -25 lib/profile/cached-profile-data.ts
```

Expected: `const REVALIDATE_SEC = 90;` and `const REVALIDATE_SLOW_SEC = 10 * 60;` near the top.

- [ ] **Step 2: Add `PULSE_REVALIDATE_SEC` constant**

Find `const REVALIDATE_SLOW_SEC = 10 * 60;` and add after it:

```typescript
const PULSE_REVALIDATE_SEC = 5 * 60; // 5 minutes — pulse shows weekly data, no need for 90s refresh
```

- [ ] **Step 3: Apply it to `getCachedProfilePulseInsights`**

Find the `getCachedProfilePulseInsights` function. It currently uses `{ revalidate: REVALIDATE_SEC }`. Change that one to `{ revalidate: PULSE_REVALIDATE_SEC }`.

Do NOT change any other function's revalidate value.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add lib/profile/cached-profile-data.ts
git commit -m "perf: bump pulse cache TTL from 90s to 5 minutes"
```

---

## Self-Review

**Spec coverage:**
- [x] Replace `listeningWindowStats` with aggregates → Task 1
- [x] `playCount` from SUM of track entity counts → Task 1 (`.reduce`)
- [x] `uniqueArtists` from count of artist entity rows → Task 1 (`artistRows.length`)
- [x] `avgPopularity` from top-50 track lookup via existing `fetchPopularityMap` → Task 1
- [x] Call sites switch to `currentWeekStart()` / `previousWeekStart()` → Task 1
- [x] Fallback returns zero-state when no aggregate rows → Task 1 (`if ... return ZERO`)
- [x] Pulse cache TTL bumped from 90s to 300s → Task 2
- [x] Only `getCachedProfilePulseInsights` TTL changes, not others → Task 2

**Type consistency:**
- `WindowStats` type unchanged: `{ playCount, avgPopularity, popSamples, uniqueArtists }` ✓
- `getWeeklyAgg` returns `{ entity_id: string; count: number }[]` — matches usage in Task 1 ✓
- `fetchPopularityMap(trackIds: string[])` signature matches `topTrackIds` (string[]) ✓

**Placeholder scan:** None found.

**Caution — Task 1 Step 4:** The `const { current, previous } = getRolling7dVsPrior7dBounds();` line must be kept — it's still used by `getListeningReportsRollingCompare` and `getTopArtistIdsForLogWindow` calls in the same `Promise.all`. Only the `listeningWindowStats` call lines change.
