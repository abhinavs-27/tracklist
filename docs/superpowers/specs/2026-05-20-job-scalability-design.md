# Job & Cron Scalability Overhaul — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Goal:** Reduce Lambda + Postgres compute costs from ~$220/month at 50 users to sustainable levels at 500K+ users by making all background jobs O(changed_data) instead of O(all_data).

---

## Context

The weekly billboard chart computation costs ~$220/month at 40–50 users because every job scans raw `logs`, paginates data into Lambda memory, and does sequential per-entity DB calls. The `user_listening_aggregates` table already exists with week/month/year buckets but is not used by chart computation. The daily cron ingest processes all `logs` into aggregates incrementally; there may be a historical backlog.

---

## Architecture Overview

Changes fall into three groups executed in dependency order:

1. **Group 1 — Code only** (Vercel deploy + Lambda rebuild): fix scans, parallelism, N+1s  
2. **Group 2 — Migration + code**: backfill aggregates, switch chart computation to read from aggregates  
3. **Group 3 — Additional migrations**: incremental entity stats, SQL co-occurrence, watermark ingest  

Log table partitioning is deferred until user count warrants it (>1M rows).

---

## Group 1: Code-Only Changes

### 1.1 Fix `getUserIdsWithLogsInRange` — paginated scan → SQL RPC

**File:** `lib/charts/billboard-week-participants.ts`  
**Problem:** Paginates through `logs` 5000 rows at a time in Node, dedupes user IDs in memory. At 10M rows/week this pulls millions of rows to Lambda.  
**Fix:** New Postgres function `get_user_ids_with_logs_in_range(start, end)` returning `SETOF UUID` via `SELECT DISTINCT user_id`. Single index scan, result returned directly. The Node function calls this RPC and maps results.

### 1.2 Fix `getCommunityIdsWithLogsInRange` — full member table pull → SQL join

**File:** `lib/charts/billboard-week-participants.ts`  
**Problem:** Fetches every row from `community_members` into Lambda (unbounded), builds a user→community map in memory, then filters by which users have logs.  
**Fix:** New Postgres function `get_community_ids_with_logs_in_range(start, end)` that does `SELECT DISTINCT cm.community_id FROM community_members cm JOIN logs l ON l.user_id = cm.user_id WHERE l.listened_at BETWEEN ...`. One SQL join, no data movement.

### 1.3 Cap prior charts query — unbounded → LIMIT 52

**File:** `lib/charts/compute-weekly-chart.ts`, line ~71  
**Problem:** Fetches every prior week's chart for a user with no limit. After 2 years = 312 JSONB rows per user per chart type.  
**Fix:** Add `.limit(52)` to the priorCharts query. One year of history is sufficient for `weeks_in_top_10` / `weeks_at_1` rollups.

### 1.4 Fix N+1 in `runBillboardWeeklyEmail`

**File:** `lib/cron/cron-runners.ts`  
**Problem:** One `SELECT` + one `UPDATE` per user = 2N sequential DB calls.  
**Fix:** Batch fetch all user rows in one query with `.in("id", userIds)`. Batch update `billboard_weekly_email_last_week` with a single RPC or `.upsert()`.

### 1.5 Increase taste identity cron parallelism

**File:** `lib/cron/cron-runners.ts`, `runTasteIdentityRefresh`  
**Problem:** Processes 35 users sequentially. At 50K users the cache goes stale for almost everyone.  
**Fix:** Process users in chunks of 10 concurrently using `Promise.allSettled`. Increases throughput to ~350 users/run without overwhelming the DB connection pool.

### 1.6 Add staleness filter to `runRefreshBlindSpots`

**File:** `lib/cron/cron-runners.ts`  
**Problem:** Fetches 100K log rows just to get distinct user IDs, then processes every user every run regardless of freshness.  
**Fix:** Query `user_blind_spots` for rows where `computed_at < NOW() - INTERVAL '7 days'` (stale users only), plus users with no row yet. Process only that set.

---

## Group 2: Aggregate Backfill + Chart Computation Rewrite

### 2.1 Migration: Bulk backfill historical logs into aggregates

**File:** `supabase/migrations/155_aggregate_backfill.sql`  
**Problem:** The daily ingest processes 2000 logs/run. Historical logs predating the aggregate system may not yet be processed, meaning week buckets for old charts are incomplete.  
**Fix:** One-time migration that calls a bulk backfill function. The function finds all `logs` not in `user_listening_aggregate_ingest`, computes their week/month/year buckets, and upserts into `user_listening_aggregates` in batches. Idempotent (safe to re-run). After this migration, all historical data is available in aggregates.

The bulk backfill function signature:
```sql
CREATE OR REPLACE FUNCTION backfill_listening_aggregates_all()
RETURNS TABLE(processed INT, skipped INT)
```
It processes in 5000-row batches, marks each log in `user_listening_aggregate_ingest`, and upserts aggregate increments.

### 2.2 Switch chart computation to read from aggregates

**File:** `lib/charts/aggregate-weekly-top-10.ts`  
**Problem:** `aggregateWeeklyTop10` paginates all `logs` for the week, then batch-fetches track/album/artist catalog rows. For a heavy listener: ~5 log pages + ~8 catalog lookups = 13+ round trips per user per chart type × 3 = 39+ round trips per user.  
**Fix:** Replace `fetchLogsWindow` + `aggregateLogsIntoWeeklyTop10` with a single query to `user_listening_aggregates`:

```sql
SELECT entity_id, count
FROM user_listening_aggregates
WHERE user_id = $1
  AND entity_type = $2   -- 'track', 'artist', 'album'
  AND week_start = $3    -- Monday of the chart week
ORDER BY count DESC
LIMIT 50;
```

The existing catalog enrichment (fetching names/images for the entity IDs) is kept as-is; only the count-aggregation step changes. This reduces chart computation from 39+ round trips to 1 + catalog lookups per user per chart type.

**Data contract:** `week_start` in `user_listening_aggregates` is always Monday UTC, matching `getLastCompletedWeekWindow`. The aggregate cron runs daily at 1:20am, so by Sunday 5am fan-out, the full prior week is populated.

---

## Group 3: Additional Migrations

### 3.1 Make `refresh_entity_stats` incremental

**File:** `lib/cron/cron-runners.ts`, `runRefreshStats`; Postgres function `refresh_entity_stats`  
**Problem:** Recomputes stats for every entity that has ever existed, doing full `logs` table scans daily.  
**Fix:** New migration adds a `last_refreshed_at` watermark to `entity_stats`. The function accepts an optional `since` parameter (default `NOW() - INTERVAL '25 hours'`). It only recomputes entities that had new `logs` rows or `reviews` rows in that window. Entities not touched in 25 hours are skipped.

### 3.2 Move co-occurrence computation to SQL

**File:** `lib/discovery/computeCooccurrence.ts`  
**Problem:** Fetches 100K log rows into Lambda, builds a `Map` of user→track sets, then computes all pairs in Node memory. Silently truncates at 100K rows. At 500K users × 20 tracks = 10M rows, only 1% would be seen.  
**Fix:** New Postgres function `compute_cooccurrence_in_db(p_since TIMESTAMPTZ)` using a self-join:

```sql
INSERT INTO media_cooccurrence (content_type, content_id, related_content_id, score, updated_at)
SELECT 'song', a.track_id, b.track_id,
       COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.track_id), 0),
       NOW()
FROM logs a JOIN logs b ON a.user_id = b.user_id AND a.track_id < b.track_id
WHERE a.listened_at >= p_since AND b.listened_at >= p_since
GROUP BY a.track_id, b.track_id
HAVING COUNT(*) >= 2
ON CONFLICT (content_type, content_id, related_content_id)
DO UPDATE SET score = EXCLUDED.score, updated_at = NOW();
```

The Node cron runner calls this single RPC instead of the current fetch-then-compute loop.

### 3.3 Replace aggregate ingest anti-join with watermark

**File:** `supabase/migrations/077_user_listening_aggregates.sql`, `get_pending_logs_for_aggregates`  
**Problem:** `LEFT JOIN user_listening_aggregate_ingest WHERE i.log_id IS NULL` forces a full join of both tables for every cron tick. As `logs` grows to millions of rows this becomes seconds per tick.  
**Fix:** New migration adds a single-row `aggregate_ingest_watermark` table with `last_processed_listened_at` and `last_processed_log_id`. The function becomes:

```sql
SELECT l.* FROM logs l
WHERE l.listened_at > (SELECT last_processed_listened_at FROM aggregate_ingest_watermark)
  OR (l.listened_at = (SELECT last_processed_listened_at FROM aggregate_ingest_watermark)
      AND l.id > (SELECT last_processed_log_id FROM aggregate_ingest_watermark))
ORDER BY l.listened_at ASC, l.id ASC
LIMIT p_limit;
```

After each batch, the watermark is updated to the last processed row. This turns an anti-join into a range scan on the `idx_logs_user_listened_at` index.

**Migration strategy:** One-time: set `last_processed_listened_at` to the `MAX(l.listened_at)` from the current `user_listening_aggregate_ingest` table, then drop the tracking table. All prior logs are already in aggregates after migration 155.

---

## Data Flow After Changes

```
EventBridge (Sunday 5am)
  → billboard-scheduler Lambda
    → get_user_ids_with_logs_in_range(week) [SQL RPC, 1 query]
    → get_community_ids_with_logs_in_range(week) [SQL RPC, 1 query]
    → enqueue N user jobs + M community jobs to SQS

billboard-worker Lambda (per job)
  → runGenerateUserBillboard(userId, week)
    → backfillMissingLogCatalogFromTracks [parallel updates]
    → Promise.all([
        computeWeeklyChart(tracks),   [reads user_listening_aggregates, 1 query]
        computeWeeklyChart(artists),  [reads user_listening_aggregates, 1 query]
        computeWeeklyChart(albums),   [reads user_listening_aggregates, 1 query]
      ])
```

Per-user DB calls drops from ~39+ to ~6 (3 aggregate reads + catalog enrichment).

---

## Lambda Configuration

Already applied:
- `billboard-worker`: 1024MB → 512MB, 900s → 180s timeout
- `billboard-scheduler`: 512MB → 128MB, 900s → 30s timeout

---

## Estimated Cost Impact

| Change | Current | After |
|--------|---------|-------|
| User ID discovery | ~100 paginated queries | 1 RPC |
| Chart computation per user | ~39 DB round trips | ~6 |
| Billboard weekly email | 2N sequential queries | 2 batch queries |
| Entity stats refresh | O(all entities) daily | O(changed entities) |
| Aggregate ingest | Anti-join (grows with logs) | Range scan (O(1)) |
| Lambda memory (billboard-worker) | 1024MB | 512MB |
| Lambda timeout waste | 13% hitting 900s | Capped at 180s |

**Projected monthly cost:** ~$20–35/month at current user count (vs $220), with costs scaling sublinearly as users grow.

---

## Out of Scope

- **Log table partitioning:** Deferred. Meaningful at >1M rows; risky migration; not needed yet.
- **Taste snapshot SQL migration:** Complex; taste_snapshots schema would need rework. Parallelism fix (Group 1) is sufficient for now.
- **mv_hidden_gems correlated subquery fix:** Low priority at current data volume; safe to defer.

---

## Files Changed

**New migrations:**
- `supabase/migrations/155_aggregate_backfill.sql`
- `supabase/migrations/156_participant_rpcs.sql` (Groups 1.1 + 1.2)
- `supabase/migrations/157_incremental_entity_stats.sql` (Group 3.1)
- `supabase/migrations/158_cooccurrence_sql.sql` (Group 3.2)
- `supabase/migrations/159_aggregate_watermark.sql` (Group 3.3)

**Modified Node/TS files:**
- `lib/charts/billboard-week-participants.ts` (1.1, 1.2)
- `lib/charts/compute-weekly-chart.ts` (1.3)
- `lib/charts/aggregate-weekly-top-10.ts` (2.2)
- `lib/cron/cron-runners.ts` (1.4, 1.5, 1.6, 3.1, 3.2)
- `lib/discovery/computeCooccurrence.ts` (3.2)
