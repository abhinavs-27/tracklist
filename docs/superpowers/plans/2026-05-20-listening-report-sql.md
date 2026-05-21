# Listening Report SQL Fast Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the listening report's unbounded log pagination with a single SQL aggregation query, reducing report load time from 10+ round trips to 2 for heavy listeners.

**Architecture:** Migration 163 adds `get_listening_report_from_aggregates(user_id, start_date, end_date)` which sums `user_listening_aggregates` by entity type. A new private fast-path function in `build-listening-report.ts` calls this RPC, fetches artist genres separately, and returns the same `ListeningReportBuildResult` shape. The public `buildListeningReport` function is unchanged — it tries the fast path first and falls back to the existing log scan if the RPC returns empty rows.

**Tech Stack:** TypeScript, Supabase PostgREST, Postgres SQL.

**Spec:** `docs/superpowers/specs/2026-05-20-listening-report-sql-design.md`

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/163_listening_report_rpc.sql` | New — `get_listening_report_from_aggregates` SQL function |
| `lib/analytics/build-listening-report.ts` | Add `buildListeningReportFromAggregates` fast path; update `buildListeningReportUncached` to try it first |

---

## Task 1: Migration 163 — `get_listening_report_from_aggregates`

**Files:**
- Create: `supabase/migrations/163_listening_report_rpc.sql`

- [ ] **Step 1: Verify no 163 migration exists**

```bash
ls supabase/migrations/ | grep "^163"
# Expected: no output
```

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/163_listening_report_rpc.sql
-- Fast path for listening reports: sum user_listening_aggregates instead of
-- paginating raw logs. Returns (entity_type, entity_id, total_count) for
-- all weeks whose Monday falls within [Monday(p_start_date), Monday(p_end_date)].
--
-- Date semantics: includes all weeks overlapping the requested range.
-- Edge over-count: 0–6 extra days at each boundary — acceptable for a report.
-- Genre counts are NOT returned; TypeScript derives them from artist play counts.

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

GRANT EXECUTE ON FUNCTION get_listening_report_from_aggregates(UUID, DATE, DATE)
  TO service_role;
```

- [ ] **Step 3: Apply migration**

```bash
npx supabase db push
# Expected: migration 163 applied
```

- [ ] **Step 4: Verify in Supabase SQL editor**

```sql
-- Should return rows for any user who has aggregate data
SELECT * FROM get_listening_report_from_aggregates(
  '<any-user-uuid>',
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE
) LIMIT 10;
-- Expected: rows with entity_type in ('track', 'album', 'artist') and total_count > 0
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/163_listening_report_rpc.sql
git commit -m "feat: migration 163 — get_listening_report_from_aggregates RPC"
```

---

## Task 2: TypeScript fast path in `build-listening-report.ts`

**Files:**
- Modify: `lib/analytics/build-listening-report.ts`

**Context:** The file currently has:
- `fetchLogsWindow` — paginates raw logs (keep as fallback)
- `sortAndCap(map)` — private helper, returns `AggregateReportRow[]` sorted by count (reuse in fast path)
- `buildListeningReportUncached(args)` — the main builder (wrap with fast-path attempt)
- `buildListeningReport` — React `cache()` wrapper (do not touch)

The `ListeningReportBuildResult` type:
```typescript
type ListeningReportBuildResult = {
  startDate: string;
  endDate: string;
  totalPlays: number;
  byEntity: Record<ReportEntityType, AggregateReportRow[]>;
};
// ReportEntityType = "track" | "album" | "artist" | "genre"
```

The `AggregateReportRow` type:
```typescript
type AggregateReportRow = {
  entity_id: string;
  count: number;
  cover_image_url?: string | null;
};
```

- [ ] **Step 1: Read the current file to confirm structure**

```bash
head -50 lib/analytics/build-listening-report.ts
```

Confirm: `sortAndCap`, `UNKNOWN_*` constants, `fetchLogsWindow`, and `buildListeningReportUncached` are all defined in this file.

- [ ] **Step 2: Add the fast-path function**

Insert the following function immediately before `buildListeningReportUncached` (the line starting with `async function buildListeningReportUncached`):

```typescript
/**
 * Fast path: reads from user_listening_aggregates instead of paginating raw logs.
 * Returns null if no aggregate rows exist (triggers log-scan fallback).
 * Genre counts are derived from artist play counts × artists.genres (same as log path).
 */
async function buildListeningReportFromAggregates(args: {
  userId: string;
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD" inclusive
}): Promise<ListeningReportBuildResult | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("get_listening_report_from_aggregates", {
    p_user_id:    args.userId,
    p_start_date: args.startDate,
    p_end_date:   args.endDate,
  });

  if (error) {
    console.warn("[listening-report] aggregates RPC failed", error.message);
    return null;
  }

  const rows = (data ?? []) as { entity_type: string; entity_id: string; total_count: number }[];
  if (!rows.length) return null;

  const trackCounts  = new Map<string, number>();
  const albumCounts  = new Map<string, number>();
  const artistCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.entity_type === "track")       trackCounts.set(row.entity_id,  row.total_count);
    else if (row.entity_type === "album")  albumCounts.set(row.entity_id,  row.total_count);
    else if (row.entity_type === "artist") artistCounts.set(row.entity_id, row.total_count);
  }

  if (trackCounts.size === 0 && albumCounts.size === 0 && artistCounts.size === 0) {
    return null;
  }

  // Fetch genres for top 200 artists (same lookup as log-scan path)
  const topArtistIds = [...artistCounts.keys()].slice(0, 200);
  const { data: artists } = topArtistIds.length
    ? await admin.from("artists").select("id, genres").in("id", topArtistIds)
    : { data: [] };

  const artistById = new Map(
    (artists ?? []).map((a) => [a.id, a as { id: string; genres: string[] | null }]),
  );

  // Weight genres by artist play count (same semantics as log-scan path)
  const genreCounts = new Map<string, number>();
  for (const [artistId, playCount] of artistCounts) {
    const genres = artistById.get(artistId)?.genres;
    if (!genres?.length) continue;
    for (const raw of genres.slice(0, 3)) {
      const genre = raw?.trim().toLowerCase();
      if (genre) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + playCount);
    }
  }

  // totalPlays = sum of track counts (matches logs.length semantics in the log-scan path)
  let totalPlays = 0;
  for (const count of trackCounts.values()) totalPlays += count;

  const byEntity: ListeningReportBuildResult["byEntity"] = {
    track:  sortAndCap(trackCounts),
    album:  sortAndCap(albumCounts),
    artist: sortAndCap(artistCounts),
    genre:  sortAndCap(genreCounts),
  };

  console.info("[listening-report] build (aggregates fast path)", {
    userId: args.userId,
    startDate: args.startDate,
    endDate: args.endDate,
    totalPlays,
    grouped: {
      tracks:  byEntity.track.length,
      albums:  byEntity.album.length,
      artists: byEntity.artist.length,
      genres:  byEntity.genre.length,
    },
  });

  return {
    startDate: args.startDate,
    endDate:   args.endDate,
    totalPlays,
    byEntity,
  };
}
```

- [ ] **Step 3: Update `buildListeningReportUncached` to try the fast path**

Find the current `buildListeningReportUncached` function. It starts with:
```typescript
async function buildListeningReportUncached(args: {
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<ListeningReportBuildResult> {
  const { startIso, endExclusiveIso } = inclusiveRangeToListenWindow({
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const logs = await fetchLogsWindow({
    userId: args.userId,
    startIso,
    endExclusiveIso,
  });
```

Replace those first lines (from the function signature through the `const logs = await fetchLogsWindow(...)` call and the lines that follow it) with:

```typescript
async function buildListeningReportUncached(args: {
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<ListeningReportBuildResult> {
  // Fast path: read from user_listening_aggregates (1 query vs N log pages)
  const fast = await buildListeningReportFromAggregates({
    userId:    args.userId,
    startDate: args.startDate,
    endDate:   args.endDate,
  });
  if (fast) return fast;

  // Fallback: no aggregate rows — paginate raw logs
  const { startIso, endExclusiveIso } = inclusiveRangeToListenWindow({
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const logs = await fetchLogsWindow({
    userId: args.userId,
    startIso,
    endExclusiveIso,
  });
```

Keep everything after `const logs = await fetchLogsWindow(...)` exactly as it is.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 5: Verify fast path fires in dev**

```bash
npm run dev &
# Wait for server to start, then hit the listening report endpoint for a user
# that has aggregate data. Check server logs for:
# [listening-report] build (aggregates fast path)
# If you see that log, the fast path is working.
# Kill dev server after check.
```

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/build-listening-report.ts
git commit -m "perf: listening report reads from user_listening_aggregates (falls back to logs)"
```

---

## Self-Review

**Spec coverage:**
- [x] Migration 163 with `get_listening_report_from_aggregates(UUID, DATE, DATE)` → Task 1
- [x] Returns `(entity_type, entity_id, total_count)` for track/album/artist → Task 1
- [x] Week filter uses `date_trunc('week', ...)` on both bounds → Task 1
- [x] `GRANT EXECUTE TO service_role` → Task 1
- [x] Fast-path `buildListeningReportFromAggregates` private function → Task 2
- [x] Returns `null` when RPC errors or returns empty → Task 2
- [x] Genre counts weighted by artist play count → Task 2
- [x] `totalPlays` = sum of track counts → Task 2
- [x] `buildListeningReportUncached` tries fast path first, falls back → Task 2
- [x] Public `buildListeningReport` signature unchanged → not touched

**Type consistency:**
- `ListeningReportBuildResult` shape used identically in fast path and existing code ✓
- `AggregateReportRow[]` returned by `sortAndCap` used in `byEntity` ✓
- RPC row type `{ entity_type: string; entity_id: string; total_count: number }` is explicit ✓

**Placeholder scan:** None found. All code blocks complete.

**Caution:** Task 2 Step 3 requires careful editing — only replace the opening lines of `buildListeningReportUncached` through the `fetchLogsWindow` call. Everything from `const trackIds =` onward must remain untouched (it's the fallback path).
