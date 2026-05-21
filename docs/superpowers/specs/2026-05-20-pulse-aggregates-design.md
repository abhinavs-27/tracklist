# Pulse Insights Aggregates Fast Path — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Goal:** Replace the last raw-log scan in the home bundle's pulse insights computation with aggregates, and increase the pulse cache TTL to reduce cold-compute frequency.

---

## Context

`GET /api/me/home-bundle` runs three parallel calls on every cold request. Two are already fast:
- `getCachedTopThisWeek` → reads `user_listening_aggregates` ✅
- `getCachedTasteIdentity` → 2000-log scan (addressed separately in taste-identity task)

The third — `getCachedProfilePulseInsights` — fires 5 parallel sub-calls. Artist/genre movers and top artist IDs already use `user_listening_aggregates`. The only remaining raw-log scan is `listeningWindowStats`, called twice (current 7-day window + previous 7-day window). It fetches up to 12,000 log rows per window to compute:

- `playCount` — total plays
- `uniqueArtists` — distinct artist count
- `avgPopularity` / `popSamples` — average track popularity and sample count (used for the "obscurity trend" pulse card)

The whole pulse result is cached with a 90-second TTL — aggressive for a "this week vs last week" view.

---

## Changes

### 1. Replace `listeningWindowStats` with aggregates (`lib/profile/profile-pulse.ts`)

**New implementation:** query `user_listening_aggregates` for the given week_start instead of fetching raw logs.

**Week_start derivation:** The current code uses a rolling 7-day window. We switch to the Monday UTC calendar week. The pulse caption already reads "This week · vs last week" — semantically calendar weeks are correct, and the rolling vs calendar difference is ≤6 days, invisible to users.

- `playCount` → `SUM(count)` where `entity_type = 'track'` for the week_start
- `uniqueArtists` → `COUNT(*)` where `entity_type = 'artist'` for the week_start (one row per distinct artist → count = distinct artists)
- `avgPopularity` / `popSamples` → fetch the top 50 track IDs from that week's track aggregate rows, then batch-lookup `popularity` from the `tracks` table. One lightweight query per window instead of 12K log rows.

The function signature `listeningWindowStats(userId, startIso, endExclusiveIso)` is private. Its call sites in `getProfilePulseInsights` pass `current.startIso` and `previous.startIso`. We derive `week_start` from `startIso` by calling `startIso.slice(0, 10)` then using `date_trunc('week', ...)` semantics — equivalently, call `currentWeekStart()` and `previousWeekStart()` from `lib/analytics/from-aggregates.ts` which already exist.

To keep the change localised, the function signature changes to:
```typescript
async function listeningWindowStats(
  userId: string,
  weekStart: string,  // "YYYY-MM-DD" Monday UTC
): Promise<WindowStats>
```

Call sites in `getProfilePulseInsights` are updated to pass `currentWeekStart()` and `previousWeekStart()` instead of rolling ISO bounds.

**Fallback:** if `user_listening_aggregates` returns no rows for the week, return the existing zero-state `{ playCount: 0, avgPopularity: null, popSamples: 0, uniqueArtists: 0 }`.

### 2. Bump pulse cache TTL (`lib/profile/cached-profile-data.ts`)

`getCachedProfilePulseInsights` currently uses `REVALIDATE_SEC = 90`. Extract a separate constant `PULSE_REVALIDATE_SEC = 300` (5 minutes) and apply it to `getCachedProfilePulseInsights` only. All other cached functions keep 90-second TTL.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/profile/profile-pulse.ts` | Replace `listeningWindowStats` with aggregates-based version; update call sites to pass `weekStart` |
| `lib/profile/cached-profile-data.ts` | Add `PULSE_REVALIDATE_SEC = 300`; apply to `getCachedProfilePulseInsights` |

No migration needed. No new tables. No changes to return types or callers outside these two files.

---

## Expected Impact

| Scenario | Before | After |
|----------|--------|-------|
| Cold pulse request | 2 × 12K-row log scans + batch catalog lookups | 2 × 1 aggregate query + 1 track popularity lookup |
| Cold pulse frequency | Every 90s | Every 300s (3× less often) |
| Combined cold-request improvement | ~5-10 queries, potentially slow | ~4 queries, fast |
