# Listening Report SQL Fast Path — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Goal:** Replace the listening report's unbounded log pagination with a single SQL aggregation query, reducing load time for heavy listeners from 10+ round trips to 2.

---

## Context

`lib/analytics/build-listening-report.ts` paginates raw `logs` 5000 rows at a time for any date range. For a user with 50K listens, that's 10+ DB pages just to count plays — before catalog lookups. The function has a comment saying it intentionally avoids `user_listening_aggregates`, but the reason (arbitrary date ranges, genre counts) is solvable.

`user_listening_aggregates` has one row per `(user_id, entity_type, entity_id, week_start)` with a play count. Summing these for weeks overlapping a date range gives accurate entity totals. The slight over-count at week boundaries (0–6 extra days) is imperceptible on a listening report.

Genre counting doesn't need to move to SQL — the current code already fetches `artists.genres` separately after getting artist IDs. With aggregates, artist IDs come from the RPC instead of log iteration; the genre lookup is unchanged.

---

## Architecture

Three components, no signature changes to public API:

1. **Migration 163** — `get_listening_report_from_aggregates` SQL function
2. **Fast path in `buildListeningReportUncached`** — calls RPC, assembles same result shape
3. **Fallback** — existing log-pagination path when RPC returns zero rows

---

## Migration 163 — `get_listening_report_from_aggregates`

```sql
CREATE OR REPLACE FUNCTION get_listening_report_from_aggregates(
  p_user_id    UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE(entity_type TEXT, entity_id TEXT, total_count BIGINT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT
    entity_type,
    entity_id,
    SUM(count)::BIGINT AS total_count
  FROM user_listening_aggregates
  WHERE user_id    = p_user_id
    AND week_start IS NOT NULL
    AND entity_type IN ('track', 'album', 'artist')
    AND week_start >= date_trunc('week', p_start_date)::date
    AND week_start <= date_trunc('week', p_end_date)::date
  GROUP BY entity_type, entity_id
  ORDER BY entity_type, total_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_listening_report_from_aggregates(UUID, DATE, DATE) TO service_role;
```

**Date range semantics:** `week_start >= Monday(startDate) AND week_start <= Monday(endDate)`. This includes all weeks that contain any part of the requested range. Edge over-count: 0–6 days at the start boundary, 0–6 days at the end boundary — acceptable for a report.

**Does not return genres.** Genre counts are derived from artist play counts in TypeScript (same as today).

---

## TypeScript Changes — `lib/analytics/build-listening-report.ts`

### Fast-path function

Add `buildListeningReportFromAggregates` (private) that:

1. Calls `admin.rpc("get_listening_report_from_aggregates", { p_user_id, p_start_date, p_end_date })`
2. Partitions results into `trackCounts`, `albumCounts`, `artistCounts` Maps
3. If all three maps are empty, returns `null` (signals fallback)
4. Fetches `artists.genres` for the top 200 artist IDs (same chunk logic as today)
5. Accumulates genre counts weighted by artist play count
6. Returns `ListeningReportBuildResult` with identical shape to the existing function

`p_start_date` is derived as `startIso.slice(0, 10)`, `p_end_date` as the day before `endExclusiveIso`.

### Updated `buildListeningReportUncached`

```typescript
async function buildListeningReportUncached(args) {
  const { startIso, endExclusiveIso } = inclusiveRangeToListenWindow(args);
  
  const fast = await buildListeningReportFromAggregates({
    userId: args.userId,
    startIso,
    endExclusiveIso,
  });
  if (fast) return fast;

  // Fallback: no aggregate rows — use log scan
  const logs = await fetchLogsWindow(...);
  // ... existing code unchanged ...
}
```

### Genre counting (fast path)

Same approach as today but using aggregate counts instead of per-log iteration:

```typescript
// artistCounts: Map<artist_id, play_count> from aggregates
for (const [artistId, playCount] of artistCounts) {
  const genres = artistById.get(artistId)?.genres;
  if (!genres?.length) continue;
  for (const raw of genres.slice(0, 3)) {
    const genre = raw?.trim().toLowerCase();
    if (genre) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + playCount);
  }
}
```

Genres are weighted by play count (same semantics as today — an artist with 100 plays contributes 100 to each of their genres, not 1).

### `totalPlays`

Set to the sum of all track counts from the aggregates RPC. This matches the current logic where `totalPlays = logs.length` (every log has a track, even if unknown).

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/163_listening_report_rpc.sql` | New — `get_listening_report_from_aggregates` function |
| `lib/analytics/build-listening-report.ts` | Add fast path, update `buildListeningReportUncached` |

No changes to: `getListeningReports.ts`, `getReportsCompare.ts`, `buildListeningReport` public API, return types, or callers.

---

## Expected Performance

| Report type | Before | After |
|------------|--------|-------|
| Week (200 listens) | 1 log page + catalog | 1 RPC + genre lookup |
| Month (800 listens) | 1 log page + catalog | 1 RPC + genre lookup |
| Year (10K listens) | 2 log pages + catalog | 1 RPC + genre lookup |
| All-time (50K listens) | 10+ log pages + catalog | 1 RPC + genre lookup |

The RPC uses `idx_ula_user_type_week` index on `(user_id, entity_type, week_start)` — already exists from migration 077.
