# Job & Cron Scalability Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Lambda + Postgres cost from ~$220/month at 50 users to sustainable levels at 500K+ users by making background jobs O(changed_data) instead of O(all_data).

**Architecture:** Replace full `logs` table scans with SQL RPCs and pre-aggregated `user_listening_aggregates` reads. Fix N+1 DB patterns and sequential processing loops. Add watermark-based ingest to replace the anti-join tracking table.

**Tech Stack:** TypeScript/Node.js, Supabase Postgres (SQL migrations), BullMQ, AWS Lambda, Vercel crons.

**Design spec:** `docs/superpowers/specs/2026-05-20-job-scalability-design.md`

**Migration numbering note:** Migrations 155 is taken (`155_repair_aggregate_non_uuid_entity_ids.sql`). New migrations use 156–160.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/156_participant_rpcs.sql` | **Create** — SQL RPCs for user/community ID discovery |
| `lib/charts/billboard-week-participants.ts` | **Modify** — call RPCs instead of paginating |
| `lib/charts/compute-weekly-chart.ts` | **Modify** — add `.limit(52)` to prior charts query |
| `lib/cron/cron-runners.ts` | **Modify** — fix N+1 email, parallelise taste identity, fix blind spots |
| `supabase/migrations/157_aggregate_backfill.sql` | **Create** — one-time historical backfill into aggregates |
| `lib/charts/aggregate-weekly-top-10.ts` | **Modify** — add `aggregateWeeklyTop10FromAggregates` |
| `lib/charts/compute-weekly-chart.ts` | **Modify** — switch to aggregates-based computation |
| `supabase/migrations/158_incremental_entity_stats.sql` | **Create** — windowed refresh_entity_stats |
| `supabase/migrations/159_cooccurrence_sql.sql` | **Create** — SQL self-join co-occurrence RPC |
| `lib/discovery/computeCooccurrence.ts` | **Modify** — call SQL RPC instead of fetch-compute-in-Node |
| `supabase/migrations/160_aggregate_watermark.sql` | **Create** — replace anti-join ingest with watermark |

---

## Task 1: Migration 156 — Participant SQL RPCs

**Files:**
- Create: `supabase/migrations/156_participant_rpcs.sql`

These RPCs replace the Node-side paginating scan in `billboard-week-participants.ts`. The SQL runs entirely in Postgres and returns only the small result set (distinct IDs), not raw rows.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/156_participant_rpcs.sql
-- Replace Node-side paginated log scans with single SQL set operations.

-- Returns every user_id that has at least one listen in [p_start, p_end).
CREATE OR REPLACE FUNCTION get_user_ids_with_logs_in_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE(user_id UUID)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT l.user_id
  FROM logs l
  WHERE l.listened_at >= p_start
    AND l.listened_at <  p_end;
$$;

-- Returns every community_id whose members have at least one listen in [p_start, p_end).
CREATE OR REPLACE FUNCTION get_community_ids_with_logs_in_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE(community_id UUID)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT cm.community_id
  FROM community_members cm
  JOIN logs l ON l.user_id = cm.user_id
  WHERE l.listened_at >= p_start
    AND l.listened_at <  p_end;
$$;

GRANT EXECUTE ON FUNCTION get_user_ids_with_logs_in_range(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION get_community_ids_with_logs_in_range(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
```

- [ ] **Step 2: Apply migration to local DB (or verify via Supabase dashboard)**

```bash
# If using local Supabase:
npx supabase db push
# Expected: migration 156 applied
```

---

## Task 2: Update Billboard Participants to Call RPCs

**Files:**
- Modify: `lib/charts/billboard-week-participants.ts`

Replace the Node-side pagination loops with RPC calls. The file currently has `getUserIdsWithLogsInRange` (paginated) and `getCommunityIdsWithLogsInRange` (full member table fetch + paginated logs). Both become single `rpc()` calls.

- [ ] **Step 1: Rewrite `lib/charts/billboard-week-participants.ts`**

```typescript
/**
 * Users and communities that qualify for weekly billboard jobs (≥1 listen in window).
 * Shared by Vercel cron paths, SQS enqueue, and workers — no `server-only` so it can run in Lambda.
 */
import { createJobsSupabaseClient } from "@/lib/jobs/service-role";

export async function getUserIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createJobsSupabaseClient();
  const { data, error } = await admin.rpc("get_user_ids_with_logs_in_range", {
    p_start: startIso,
    p_end: endExclusiveIso,
  });
  if (error) {
    console.warn("[weekly-chart] get_user_ids_with_logs_in_range", error.message);
    return [];
  }
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function getCommunityIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createJobsSupabaseClient();
  const { data, error } = await admin.rpc("get_community_ids_with_logs_in_range", {
    p_start: startIso,
    p_end: endExclusiveIso,
  });
  if (error) {
    console.warn("[community-weekly-chart] get_community_ids_with_logs_in_range", error.message);
    return [];
  }
  return (data ?? []).map((r: { community_id: string }) => r.community_id);
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
# Expected: no errors in billboard-week-participants.ts
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/156_participant_rpcs.sql lib/charts/billboard-week-participants.ts
git commit -m "perf: replace log-pagination scans with SQL RPCs for billboard participants"
```

---

## Task 3: Cap Prior Charts Query to 52 Weeks

**Files:**
- Modify: `lib/charts/compute-weekly-chart.ts` (line ~71)

The priorCharts query currently fetches every chart ever for a user — unbounded. After 2 years that's 312+ JSONB rows per user per chart type. One year (52 weeks) is sufficient for the rollup stats.

- [ ] **Step 1: Find the query in `lib/charts/compute-weekly-chart.ts`**

The relevant block (currently around line 65–75):
```typescript
const { data: priorCharts } = await admin
  .from("user_weekly_charts")
  .select("rankings")
  .eq("user_id", args.userId)
  .eq("chart_type", dbType)
  .lt("week_start", args.weekStart.toISOString())
  .order("week_start", { ascending: true });
```

- [ ] **Step 2: Add `.limit(52)` to the priorCharts query**

Change to:
```typescript
const { data: priorCharts } = await admin
  .from("user_weekly_charts")
  .select("rankings")
  .eq("user_id", args.userId)
  .eq("chart_type", dbType)
  .lt("week_start", args.weekStart.toISOString())
  .order("week_start", { ascending: false })
  .limit(52);
```

Note: order changed to `descending` so `.limit(52)` keeps the most recent 52 weeks. `rollupEntityHistory` receives them in descending order — verify this is fine in `lib/charts/historical-chart-stats.ts`. If it requires ascending, change the order back to ascending and add `.limit(52)` after `order`.

- [ ] **Step 3: Check `rollupEntityHistory` order sensitivity**

```bash
grep -n "rollupEntityHistory\|priorCharts\|forEach\|reduce\|map" lib/charts/historical-chart-stats.ts | head -20
```

If `rollupEntityHistory` iterates in order and the direction matters (e.g., for computing `appeared_before`), keep `ascending: true` and add `.limit(52)` — the 52 oldest of the query window. For the `weeks_in_top_10` / `weeks_at_1` rollups, any 52-week window is fine.

- [ ] **Step 4: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add lib/charts/compute-weekly-chart.ts
git commit -m "perf: cap prior charts query to 52 weeks (was unbounded)"
```

---

## Task 4: Fix N+1 in `runBillboardWeeklyEmail`

**Files:**
- Modify: `lib/cron/cron-runners.ts` (lines ~330–400)

Current code runs one `SELECT` + one `UPDATE` per user ID inside a `for` loop. Fix: batch-fetch all users in one query, then batch-update sent users in one query.

- [ ] **Step 1: Locate the loop in `runBillboardWeeklyEmail`**

```bash
grep -n "for.*userId.*userIds\|billboard_weekly_email" lib/cron/cron-runners.ts | head -10
```

The loop starts after `const userIds = [...]` and runs `admin.from("users").select(...).eq("id", userId)` inside.

- [ ] **Step 2: Replace the N+1 loop**

Find and replace the entire `for (const userId of userIds) { ... }` block (and the final return) with:

```typescript
  // Batch-fetch all candidate users in one query (was N individual SELECTs)
  const { data: userRows, error: usersErr } = await admin
    .from("users")
    .select("id, email, billboard_weekly_email_last_week")
    .in("id", userIds);

  if (usersErr) throw new Error(usersErr.message);

  const sentUserIds: string[] = [];

  for (const userRow of userRows ?? []) {
    const { id: userId, email, billboard_weekly_email_last_week } = userRow as {
      id: string;
      email: string | null;
      billboard_weekly_email_last_week: string | null;
    };

    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    if (billboard_weekly_email_last_week === weekStart) {
      skippedAlready += 1;
      continue;
    }

    const sendResult = await sendBillboardWeeklyDigestEmail({
      userId,
      email,
      weekStart,
    });

    if (sendResult.ok) {
      sentUserIds.push(userId);
      sent += 1;
    } else {
      sendFailed += 1;
      if (!firstSendError) firstSendError = sendResult.reason;
    }
  }

  // Batch-update all successful sends in one query (was N individual UPDATEs)
  if (sentUserIds.length > 0) {
    const { error: upErr } = await admin
      .from("users")
      .update({ billboard_weekly_email_last_week: weekStart })
      .in("id", sentUserIds);
    if (upErr) {
      console.error(LOG, "billboard-weekly-email batch update", upErr);
    }
  }
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/cron/cron-runners.ts
git commit -m "perf: batch user fetch/update in runBillboardWeeklyEmail (was N+1)"
```

---

## Task 5: Parallelise Taste Identity Cron

**Files:**
- Modify: `lib/cron/cron-runners.ts` — `runTasteIdentityRefresh` function

Currently processes 35 users sequentially. At 50K users the cache goes stale for almost everyone. Fix: process in chunks of 10 concurrently using `Promise.allSettled`.

- [ ] **Step 1: Find `runTasteIdentityRefresh` in `cron-runners.ts`**

```bash
grep -n "runTasteIdentityRefresh\|for.*userId.*userIds\|refreshTasteIdentityCacheForUser" lib/cron/cron-runners.ts | head -10
```

- [ ] **Step 2: Replace sequential loop with parallel chunks**

Replace the `for (const userId of userIds) { ... }` loop inside `runTasteIdentityRefresh`:

```typescript
  const CONCURRENCY = 10;
  for (let i = 0; i < userIds.length; i += CONCURRENCY) {
    const chunk = userIds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((userId) => refreshTasteIdentityCacheForUser(userId)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        processed += 1;
      } else {
        console.error(LOG, "taste-identity refresh failed", r.reason);
        failures += 1;
      }
    }
  }
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/cron/cron-runners.ts
git commit -m "perf: run taste identity refresh 10-at-a-time (was sequential)"
```

---

## Task 6: Fix Blind Spots Staleness Filter

**Files:**
- Modify: `lib/cron/cron-runners.ts` — `runRefreshBlindSpots` function

Currently fetches up to 100K rows from `logs` just to find distinct user IDs. Fix: query `user_blind_spots` for stale rows and the aggregates table for users not yet computed.

- [ ] **Step 1: Find `runRefreshBlindSpots`**

```bash
grep -n "runRefreshBlindSpots\|100_000\|FROM.*logs.*user_id" lib/cron/cron-runners.ts | head -10
```

- [ ] **Step 2: Replace the user ID scan**

Replace the `admin.from("logs").select("user_id").limit(100_000)` block with:

```typescript
  // Users whose blind spots are stale (computed > 7 days ago)
  const { data: staleRows, error: staleErr } = await admin
    .from("user_blind_spots")
    .select("user_id")
    .lt("computed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (staleErr) throw new Error(`[blind-spots] stale query: ${staleErr.message}`);

  // Users with any listening history but no blind spots row yet
  const { data: newRows, error: newErr } = await admin
    .from("user_listening_aggregates")
    .select("user_id")
    .eq("entity_type", "track")
    .not("year", "is", null)
    .limit(500);

  if (newErr) throw new Error(`[blind-spots] new-users query: ${newErr.message}`);

  const existingSet = new Set((staleRows ?? []).map((r) => r.user_id as string));
  const { data: existingBlindSpots } = await admin.from("user_blind_spots").select("user_id");
  const hasBlindSpot = new Set((existingBlindSpots ?? []).map((r) => r.user_id as string));

  for (const r of newRows ?? []) {
    const uid = r.user_id as string;
    if (!hasBlindSpot.has(uid)) existingSet.add(uid);
  }

  const userIds = [...existingSet];
```

Then keep the existing `for (const userId of userIds) { ... }` loop unchanged.

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/cron/cron-runners.ts
git commit -m "perf: blind spots cron queries stale rows instead of scanning 100K logs"
```

---

## Task 7: Migration 157 — Historical Aggregate Backfill

**Files:**
- Create: `supabase/migrations/157_aggregate_backfill.sql`

One-time backfill that processes all `logs` not yet in `user_listening_aggregate_ingest` and adds them to `user_listening_aggregates`. Required before Task 8 (switching charts to read from aggregates), otherwise old weeks will have zero counts.

The function is intentionally idempotent — safe to run multiple times.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/157_aggregate_backfill.sql
-- One-time backfill: processes all logs not yet in user_listening_aggregate_ingest.
-- After this migration, user_listening_aggregates has data for all historical weeks.
-- Idempotent: re-running skips already-ingested logs.

CREATE OR REPLACE FUNCTION backfill_listening_aggregates_all(
  p_batch_size INT DEFAULT 5000
)
RETURNS TABLE(processed INT, skipped INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INT := 0;
  v_skipped   INT := 0;
  v_batch     RECORD;
  v_week_start DATE;
  v_month      DATE;
  v_year       INT;
BEGIN
  -- Process in batches to avoid lock contention and statement timeouts.
  LOOP
    -- Fetch next batch of un-ingested logs
    CREATE TEMP TABLE IF NOT EXISTS _backfill_batch AS
    SELECT l.id, l.user_id, l.track_id, l.album_id, l.artist_id, l.listened_at
    FROM logs l
    LEFT JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
    WHERE i.log_id IS NULL
    ORDER BY l.listened_at ASC
    LIMIT p_batch_size;

    -- Exit when no more rows
    IF NOT EXISTS (SELECT 1 FROM _backfill_batch) THEN
      DROP TABLE _backfill_batch;
      EXIT;
    END IF;

    -- Upsert track aggregates
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      b.user_id,
      'track',
      b.track_id::text,
      1,
      date_trunc('week', b.listened_at AT TIME ZONE 'UTC')::date,
      NULL,
      NULL
    FROM _backfill_batch b
    WHERE b.track_id IS NOT NULL
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now();

    -- Upsert album aggregates
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      b.user_id,
      'album',
      b.album_id::text,
      1,
      date_trunc('week', b.listened_at AT TIME ZONE 'UTC')::date,
      NULL,
      NULL
    FROM _backfill_batch b
    WHERE b.album_id IS NOT NULL
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now();

    -- Upsert artist aggregates
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      b.user_id,
      'artist',
      b.artist_id::text,
      1,
      date_trunc('week', b.listened_at AT TIME ZONE 'UTC')::date,
      NULL,
      NULL
    FROM _backfill_batch b
    WHERE b.artist_id IS NOT NULL
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now();

    -- Also upsert month and year buckets for track (for all-time stats)
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      b.user_id,
      'track',
      b.track_id::text,
      1,
      NULL,
      date_trunc('month', b.listened_at AT TIME ZONE 'UTC')::date,
      NULL
    FROM _backfill_batch b
    WHERE b.track_id IS NOT NULL
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now();

    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      b.user_id,
      'track',
      b.track_id::text,
      1,
      NULL,
      NULL,
      EXTRACT(YEAR FROM b.listened_at AT TIME ZONE 'UTC')::int
    FROM _backfill_batch b
    WHERE b.track_id IS NOT NULL
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now();

    -- Mark batch as ingested
    INSERT INTO user_listening_aggregate_ingest (log_id, processed_at)
    SELECT id, now() FROM _backfill_batch
    ON CONFLICT (log_id) DO NOTHING;

    GET DIAGNOSTICS v_processed = ROW_COUNT;

    DROP TABLE _backfill_batch;
  END LOOP;

  processed := v_processed;
  skipped   := v_skipped;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_listening_aggregates_all(INT) TO service_role;

-- Run the backfill immediately as part of applying the migration.
-- This may take several minutes on large datasets. It's safe to re-run.
SELECT * FROM backfill_listening_aggregates_all(5000);
```

**Note:** The `SELECT * FROM backfill_...` at the end runs the backfill when the migration is applied. For very large datasets (>500K logs), comment it out and run it manually from the Supabase SQL editor after applying.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
# Expected: migration 157 applied, backfill runs
```

- [ ] **Step 3: Verify backfill results**

In Supabase SQL editor:
```sql
-- Check total aggregate rows created
SELECT entity_type, COUNT(*) FROM user_listening_aggregates WHERE week_start IS NOT NULL GROUP BY entity_type;

-- Check no un-ingested logs remain
SELECT COUNT(*) FROM logs l LEFT JOIN user_listening_aggregate_ingest i ON i.log_id = l.id WHERE i.log_id IS NULL;
-- Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/157_aggregate_backfill.sql
git commit -m "perf: migration 157 — backfill historical logs into user_listening_aggregates"
```

---

## Task 8: Switch Chart Computation to Read from Aggregates

**Files:**
- Modify: `lib/charts/aggregate-weekly-top-10.ts` — add `aggregateWeeklyTop10FromAggregates`
- Modify: `lib/charts/compute-weekly-chart.ts` — use new function with fallback

This replaces the 5000-row-at-a-time log pagination + catalog lookups with a single `user_listening_aggregates` query per chart type. Catalog enrichment (names/images) is unchanged — only the count-aggregation step changes.

**Pre-condition:** Migration 157 (backfill) must be applied first.

- [ ] **Step 1: Add `aggregateWeeklyTop10FromAggregates` to `lib/charts/aggregate-weekly-top-10.ts`**

Add this function before `aggregateWeeklyTop10` (around line 325):

```typescript
/**
 * Fast path: reads play counts from user_listening_aggregates rather than paginating raw logs.
 * Returns empty array if no aggregate rows exist for this week (safe fallback signal).
 * week_start must be a Monday UTC date (ISO date string, e.g. "2025-01-06").
 */
export async function aggregateWeeklyTop10FromAggregates(args: {
  userId: string;
  weekStart: string; // ISO date "YYYY-MM-DD"
  chartType: ChartType;
}): Promise<AggregatedPlay[]> {
  const admin = createSupabaseAdminClient();

  const entityType =
    args.chartType === "tracks"
      ? "track"
      : args.chartType === "artists"
        ? "artist"
        : "album";

  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, count")
    .eq("user_id", args.userId)
    .eq("entity_type", entityType)
    .eq("week_start", args.weekStart)
    .order("count", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[weekly-chart] aggregates read", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    entity_id: (r as { entity_id: string; count: number }).entity_id,
    play_count: (r as { entity_id: string; count: number }).count,
    last_played_at: args.weekStart, // week_start as proxy; unused in compute-weekly-chart.ts
  }));
}
```

- [ ] **Step 2: Update `aggregateWeeklyTop10` to try aggregates first, fall back to logs**

Replace the existing `aggregateWeeklyTop10` function (line 325+) in `lib/charts/aggregate-weekly-top-10.ts`:

```typescript
export async function aggregateWeeklyTop10(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
  chartType: ChartType;
}): Promise<AggregatedPlay[]> {
  // Convert startIso to YYYY-MM-DD for the aggregates table week_start column
  const weekStart = args.startIso.slice(0, 10);

  const fromAggregates = await aggregateWeeklyTop10FromAggregates({
    userId: args.userId,
    weekStart,
    chartType: args.chartType,
  });

  if (fromAggregates.length > 0) {
    return fromAggregates;
  }

  // Fallback: user has no aggregate rows for this week (pre-backfill or missing data).
  // Re-aggregate from raw logs so the chart is still produced.
  const logs = await fetchLogsWindow({
    userId: args.userId,
    startIso: args.startIso,
    endExclusiveIso: args.endExclusiveIso,
  });
  return aggregateLogsIntoWeeklyTop10(logs, args.chartType);
}
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Verify the chartType→entity_type mapping**

The mapping is:
- `"tracks"` → `"track"` ✓ (entity_type in aggregates table uses singular)
- `"artists"` → `"artist"` ✓
- `"albums"` → `"album"` ✓

Confirm by checking the aggregates table:
```sql
SELECT DISTINCT entity_type FROM user_listening_aggregates;
-- Should show: track, artist, album (and possibly genre)
```

- [ ] **Step 5: Commit**

```bash
git add lib/charts/aggregate-weekly-top-10.ts
git commit -m "perf: chart computation reads user_listening_aggregates (falls back to logs if empty)"
```

---

## Task 9: Migration 158 — Incremental Entity Stats

**Files:**
- Create: `supabase/migrations/158_incremental_entity_stats.sql`

`refresh_entity_stats` currently recomputes every entity ever, doing full `logs` table scans daily. Add a `since` window so only recently-active entities are refreshed.

- [ ] **Step 1: Read the current `refresh_entity_stats` function**

```bash
grep -n "refresh_entity_stats" supabase/migrations/089_refresh_entity_stats_skip_null_album.sql | head -3
cat supabase/migrations/089_refresh_entity_stats_skip_null_album.sql | head -60
```

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/158_incremental_entity_stats.sql
-- Add a `p_since` window to refresh_entity_stats so only recently-changed
-- entities are recomputed. Defaults to the last 25 hours.
-- Entities with no new logs/reviews in the window are skipped.

CREATE OR REPLACE FUNCTION refresh_entity_stats(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '25 hours');
BEGIN
  -- ── Track stats ────────────────────────────────────────────────────────────
  INSERT INTO track_stats (track_id, play_count, review_count, avg_rating, updated_at)
  SELECT
    l.track_id,
    COUNT(*)                                           AS play_count,
    COUNT(r.id)                                        AS review_count,
    AVG(r.rating)                                      AS avg_rating,
    NOW()
  FROM logs l
  LEFT JOIN reviews r ON r.entity_id = l.track_id AND r.entity_type = 'track'
  WHERE l.track_id IS NOT NULL
    AND (l.listened_at >= v_since OR r.created_at >= v_since)
  GROUP BY l.track_id
  ON CONFLICT (track_id)
  DO UPDATE SET
    play_count   = EXCLUDED.play_count,
    review_count = EXCLUDED.review_count,
    avg_rating   = EXCLUDED.avg_rating,
    updated_at   = NOW();

  -- ── Album stats ────────────────────────────────────────────────────────────
  INSERT INTO album_stats (album_id, play_count, review_count, avg_rating, updated_at)
  SELECT
    COALESCE(l.album_id, t.album_id)                   AS album_id,
    COUNT(*)                                            AS play_count,
    COUNT(r.id)                                         AS review_count,
    AVG(r.rating)                                       AS avg_rating,
    NOW()
  FROM logs l
  LEFT JOIN tracks t ON t.id = l.track_id
  LEFT JOIN reviews r ON r.entity_id = COALESCE(l.album_id, t.album_id)
                      AND r.entity_type = 'album'
  WHERE COALESCE(l.album_id, t.album_id) IS NOT NULL
    AND (l.listened_at >= v_since OR r.created_at >= v_since)
  GROUP BY COALESCE(l.album_id, t.album_id)
  ON CONFLICT (album_id)
  DO UPDATE SET
    play_count   = EXCLUDED.play_count,
    review_count = EXCLUDED.review_count,
    avg_rating   = EXCLUDED.avg_rating,
    updated_at   = NOW();

  -- ── Artist stats ───────────────────────────────────────────────────────────
  INSERT INTO artist_stats (artist_id, play_count, review_count, avg_rating, updated_at)
  SELECT
    COALESCE(l.artist_id, t.artist_id)                 AS artist_id,
    COUNT(*)                                            AS play_count,
    COUNT(r.id)                                         AS review_count,
    AVG(r.rating)                                       AS avg_rating,
    NOW()
  FROM logs l
  LEFT JOIN tracks t ON t.id = l.track_id
  LEFT JOIN reviews r ON r.entity_id = COALESCE(l.artist_id, t.artist_id)
                      AND r.entity_type = 'artist'
  WHERE COALESCE(l.artist_id, t.artist_id) IS NOT NULL
    AND (l.listened_at >= v_since OR r.created_at >= v_since)
  GROUP BY COALESCE(l.artist_id, t.artist_id)
  ON CONFLICT (artist_id)
  DO UPDATE SET
    play_count   = EXCLUDED.play_count,
    review_count = EXCLUDED.review_count,
    avg_rating   = EXCLUDED.avg_rating,
    updated_at   = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_entity_stats(TIMESTAMPTZ) TO service_role;
```

**Important:** The exact shape of `track_stats`, `album_stats`, and `artist_stats` (column names, conflict targets) must match what's in `supabase/migrations/036_entity_stats_cache.sql` and `089_refresh_entity_stats_skip_null_album.sql`. Read those files before applying — adjust column names if different.

- [ ] **Step 3: Verify column shapes match**

```bash
grep -n "INSERT INTO.*_stats\|ON CONFLICT\|play_count\|review_count" supabase/migrations/089_refresh_entity_stats_skip_null_album.sql | head -30
```

Adjust migration 158 to match exactly.

- [ ] **Step 4: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/158_incremental_entity_stats.sql
git commit -m "perf: migration 158 — refresh_entity_stats accepts p_since window (defaults 25h)"
```

---

## Task 10: Migration 159 — SQL Co-occurrence Computation

**Files:**
- Create: `supabase/migrations/159_cooccurrence_sql.sql`
- Modify: `lib/discovery/computeCooccurrence.ts`

Currently `computeSongCooccurrence` and `computeAlbumCooccurrence` each fetch up to 100K log rows into Lambda, build Maps in Node, then upsert thousands of rows. At scale this fails silently (100K cap). Move the computation into a SQL self-join.

- [ ] **Step 1: Check `media_cooccurrence` table schema**

```bash
grep -rn "CREATE TABLE.*media_cooccurrence\|content_type.*content_id.*related" supabase/migrations/ | head -5
```

Note the conflict target — it should be `(content_type, content_id, related_content_id)`.

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/159_cooccurrence_sql.sql
-- Move co-occurrence computation from Node (fetch 100K rows, compute in memory)
-- to SQL (self-join, runs entirely in Postgres). Eliminates silent 100K truncation.

CREATE OR REPLACE FUNCTION compute_song_cooccurrence_in_db(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(pairs_written INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '90 days');
  v_written INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'song',
    a.track_id::text,
    b.track_id::text,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.track_id), 0),
    NOW()
  FROM logs a
  JOIN logs b
    ON  a.user_id  = b.user_id
    AND a.track_id < b.track_id
  WHERE a.listened_at >= v_since
    AND b.listened_at >= v_since
    AND a.track_id IS NOT NULL
    AND b.track_id IS NOT NULL
  GROUP BY a.track_id, b.track_id
  HAVING COUNT(*) >= 2
  ON CONFLICT (content_type, content_id, related_content_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    updated_at = NOW();

  GET DIAGNOSTICS v_written = ROW_COUNT;
  pairs_written := v_written;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION compute_album_cooccurrence_in_db(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(pairs_written INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '90 days');
  v_written INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'album',
    a.album_id::text,
    b.album_id::text,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.album_id), 0),
    NOW()
  FROM logs a
  JOIN logs b
    ON  a.user_id  = b.user_id
    AND a.album_id < b.album_id
  WHERE a.listened_at >= v_since
    AND b.listened_at >= v_since
    AND a.album_id IS NOT NULL
    AND b.album_id IS NOT NULL
  GROUP BY a.album_id, b.album_id
  HAVING COUNT(*) >= 2
  ON CONFLICT (content_type, content_id, related_content_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    updated_at = NOW();

  GET DIAGNOSTICS v_written = ROW_COUNT;
  pairs_written := v_written;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_song_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION compute_album_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
```

- [ ] **Step 3: Update `runComputeCooccurrence` in `lib/cron/cron-runners.ts`**

Replace the call to `computeSongCooccurrence()` / `computeAlbumCooccurrence()` in `runComputeCooccurrence`:

```typescript
export async function runComputeCooccurrence(): Promise<{
  ok: true;
  songs: { pairs_written: number };
  albums: { pairs_written: number };
}> {
  const admin = createSupabaseAdminClient();

  const { data: songData, error: songErr } = await admin.rpc(
    "compute_song_cooccurrence_in_db",
  );
  if (songErr) throw new Error(songErr.message);

  const { data: albumData, error: albumErr } = await admin.rpc(
    "compute_album_cooccurrence_in_db",
  );
  if (albumErr) throw new Error(albumErr.message);

  const songs = { pairs_written: (songData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0 };
  const albums = { pairs_written: (albumData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0 };

  console.log(LOG, "co-occurrence done", { songs, albums });
  return { ok: true, songs, albums };
}
```

Remove the `computeSongCooccurrence` and `computeAlbumCooccurrence` imports from the top of `cron-runners.ts` if they're no longer referenced elsewhere.

- [ ] **Step 4: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 5: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/159_cooccurrence_sql.sql lib/cron/cron-runners.ts
git commit -m "perf: migration 159 — co-occurrence computed via SQL self-join (was 100K fetch into Node)"
```

---

## Task 11: Migration 160 — Aggregate Watermark (Replace Anti-join)

**Files:**
- Create: `supabase/migrations/160_aggregate_watermark.sql`

The current `get_pending_logs_for_aggregates` does `LEFT JOIN user_listening_aggregate_ingest WHERE log_id IS NULL` — an anti-join that gets slower as both tables grow. Replace with a single-row watermark table tracking the last processed `(listened_at, log_id)` cursor.

**Pre-condition:** Migration 157 backfill must have run to completion (all existing logs are in the ingest table). The watermark is seeded from the max processed timestamp.

- [ ] **Step 1: Verify backfill is complete before applying**

```sql
-- Run in Supabase SQL editor first:
SELECT COUNT(*) FROM logs l
LEFT JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
WHERE i.log_id IS NULL;
-- Must be 0 before applying migration 160
```

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/160_aggregate_watermark.sql
-- Replace anti-join tracking table with a single-row watermark cursor.
-- Pre-condition: migration 157 backfill has run; all logs are in user_listening_aggregate_ingest.

CREATE TABLE IF NOT EXISTS aggregate_ingest_watermark (
  id                          BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), -- single-row table
  last_processed_listened_at  TIMESTAMPTZ NOT NULL,
  last_processed_log_id       UUID        NOT NULL
);

-- Seed watermark from the current ingest table max.
-- After this, all logs up to this point are already processed.
INSERT INTO aggregate_ingest_watermark
  (id, last_processed_listened_at, last_processed_log_id)
SELECT
  true,
  MAX(l.listened_at),
  (SELECT i2.log_id FROM user_listening_aggregate_ingest i2
   JOIN logs l2 ON l2.id = i2.log_id
   WHERE l2.listened_at = MAX(l.listened_at)
   ORDER BY l2.id ASC LIMIT 1)
FROM user_listening_aggregate_ingest i
JOIN logs l ON l.id = i.log_id
ON CONFLICT (id) DO NOTHING;

-- Replace get_pending_logs_for_aggregates with watermark-based range scan.
-- Replaces the anti-join that was O(logs × ingest) with an indexed range scan.
CREATE OR REPLACE FUNCTION get_pending_logs_for_aggregates(p_limit INT DEFAULT 2000)
RETURNS SETOF logs
LANGUAGE sql
STABLE
AS $$
  SELECT l.*
  FROM logs l
  CROSS JOIN aggregate_ingest_watermark w
  WHERE l.listened_at > w.last_processed_listened_at
     OR (l.listened_at = w.last_processed_listened_at AND l.id > w.last_processed_log_id)
  ORDER BY l.listened_at ASC, l.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$$;

-- Update the watermark after each batch is processed.
-- Called by the cron job after apply_listening_aggregate_deltas completes.
CREATE OR REPLACE FUNCTION advance_aggregate_ingest_watermark(
  p_listened_at TIMESTAMPTZ,
  p_log_id      UUID
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE aggregate_ingest_watermark
  SET last_processed_listened_at = p_listened_at,
      last_processed_log_id      = p_log_id
  WHERE id = true;
$$;

DISABLE ROW LEVEL SECURITY ON aggregate_ingest_watermark;
ALTER TABLE aggregate_ingest_watermark DISABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON aggregate_ingest_watermark TO service_role;
GRANT EXECUTE ON FUNCTION get_pending_logs_for_aggregates(INT) TO service_role;
GRANT EXECUTE ON FUNCTION advance_aggregate_ingest_watermark(TIMESTAMPTZ, UUID) TO service_role;
```

- [ ] **Step 3: Update the cron job that calls `get_pending_logs_for_aggregates`**

Find the cron job that calls this function — likely in `app/api/cron/listening-aggregates/route.ts` or `lib/cron/cron-runners.ts`:

```bash
grep -rn "get_pending_logs_for_aggregates\|advance_aggregate_ingest_watermark" app/ lib/ --include="*.ts" | head -10
```

After each batch is processed, add a call to advance the watermark:

```typescript
// After apply_listening_aggregate_deltas for a batch:
const lastRow = batch[batch.length - 1];
await admin.rpc("advance_aggregate_ingest_watermark", {
  p_listened_at: lastRow.listened_at,
  p_log_id: lastRow.id,
});
```

Exact location depends on the cron job structure. The pattern is: after each batch is upserted into aggregates, call `advance_aggregate_ingest_watermark` with the last row's `listened_at` and `id`.

- [ ] **Step 4: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/160_aggregate_watermark.sql
git add -p lib/  # stage only the watermark advance calls
git commit -m "perf: migration 160 — aggregate ingest watermark replaces anti-join tracking table"
```

---

## Task 12: Vercel Deploy

- [ ] **Step 1: Final typecheck and lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 2: Deploy to Vercel**

```bash
# Via git push to main (triggers Vercel auto-deploy), or:
vercel --prod
```

- [ ] **Step 3: Monitor first billboard cron run**

```bash
# Next Sunday's 5am fan-out — check Vercel logs:
vercel logs --follow
# Or check CloudWatch for billboard-worker Lambda:
aws logs tail /aws/lambda/billboard-worker --follow --region us-east-2
```

Expected: billboard-worker jobs completing well under 30s each (was ~116s avg), no 900s timeouts.

- [ ] **Step 4: Verify cost reduction in AWS Cost Explorer**

After one week, check Lambda cost:
- `us-east-2` → Lambda → `billboard-worker`
- Expected: ~85–90% cost reduction from Task 1 (SQL RPCs) + Task 8 (aggregates)

---

## Self-Review Checklist

**Spec coverage:**
- [x] 1.1 `getUserIdsWithLogsInRange` → SQL RPC (Task 1 + 2)
- [x] 1.2 `getCommunityIdsWithLogsInRange` → SQL RPC (Task 1 + 2)
- [x] 1.3 Prior charts LIMIT 52 (Task 3)
- [x] 1.4 N+1 in billboard weekly email (Task 4)
- [x] 1.5 Taste identity parallelism (Task 5)
- [x] 1.6 Blind spots staleness filter (Task 6)
- [x] 2.1 Aggregate backfill migration (Task 7)
- [x] 2.2 Chart computation from aggregates (Task 8)
- [x] 3.1 Incremental entity stats (Task 9)
- [x] 3.2 SQL co-occurrence (Task 10)
- [x] 3.3 Aggregate watermark (Task 11)

**Dependency order:**
- Task 7 (backfill) must complete before Task 8 (switch to aggregates)
- Task 7 must complete before Task 11 (watermark seeding requires full ingest table)
- Tasks 1–6 are independent of 7–11 and can deploy earlier

**Migration numbers:** 156–160 (155 is taken by `155_repair_aggregate_non_uuid_entity_ids.sql`)

**Caution items:**
- Task 9 (incremental entity stats): verify column names match the existing `refresh_entity_stats` signature before applying
- Task 11 (watermark): must verify backfill is 100% complete (0 un-ingested logs) before running; otherwise new watermark skips historical logs
