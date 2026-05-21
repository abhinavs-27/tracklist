# Logs Archival Table — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Goal:** Keep the `logs` table small (recent data only) by moving old rows to a lightweight `logs_archive` table, preventing query plan degradation as the table grows toward millions of rows.

---

## Context

The `logs` table has 31K rows and is growing rapidly. Native Postgres range partitioning is ruled out because four tables reference `logs.id` as a FK — partitioning would require changing the primary key to `(id, listened_at)` and rewriting those FKs, a high-risk schema change.

The archival approach works instead: a `logs_archive` table has the same columns but weaker constraints. A monthly cron moves rows older than 180 days. Since `user_listening_aggregates` already covers all historical data, old logs are rarely needed — the fallback log scans in the report and taste paths only fire when aggregates are missing, which only happens for very recent data.

Key property: `user_listening_aggregate_ingest` has `ON DELETE CASCADE` on `log_id REFERENCES logs(id)`, so deleting from `logs` automatically cleans up the tracking table with no extra code.

---

## Components

### 1. Migration 164 — `logs_archive` table + `archive_old_logs` function

**`logs_archive`** — same columns as `logs`, user FK kept (so user deletion still cascades), no FK from `user_listening_aggregate_ingest`:

```sql
CREATE TABLE IF NOT EXISTS logs_archive (
  id           UUID        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id     TEXT,
  type         TEXT,
  title        TEXT,
  rating       SMALLINT,
  review       TEXT,
  listened_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT,
  album_id     TEXT,
  artist_id    TEXT,
  note         TEXT
);
```

Index on `(user_id, listened_at DESC)` for any future queries. RLS disabled (same as `logs`).

**`archive_old_logs(p_cutoff_days INT DEFAULT 180, p_batch_size INT DEFAULT 5000)`** — SQL function that atomically moves one batch of old rows from `logs` to `logs_archive`:

```sql
WITH to_archive AS (
  SELECT id FROM logs
  WHERE listened_at < NOW() - (p_cutoff_days || ' days')::INTERVAL
  ORDER BY listened_at ASC, id ASC
  LIMIT p_batch_size
),
moved AS (
  INSERT INTO logs_archive
  SELECT l.*
  FROM logs l
  JOIN to_archive t ON t.id = l.id
  RETURNING l.id
)
DELETE FROM logs l
USING moved m
WHERE l.id = m.id;
```

The DELETE cascades to `user_listening_aggregate_ingest` automatically. The CTE makes the INSERT + DELETE atomic — no window where rows exist in both tables or neither. Returns count of rows moved.

Function is idempotent: running it twice only moves what's still in `logs`.

### 2. `lib/cron/cron-runners.ts` — `runArchiveOldLogs`

```typescript
export async function runArchiveOldLogs(
  cutoffDays = 180,
): Promise<{ ok: true; archived: number }> {
  const run = await startJobRun("archive_old_logs", { cutoff_days: cutoffDays });
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("archive_old_logs", {
      p_cutoff_days: cutoffDays,
      p_batch_size: 5000,
    });
    if (error) throw new Error(error.message);
    const archived = (data?.[0] as { archived: number } | undefined)?.archived ?? 0;
    console.log("[cron-runners] archive_old_logs done", { archived });
    void run.finish({ status: archived > 0 ? "ok" : "skipped", items_ok: archived });
    return { ok: true, archived };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

### 3. `app/api/cron/archive-old-logs/route.ts` — Cron endpoint

Standard cron route handler pattern. Protected by `CRON_SECRET`. Accepts optional `?cutoff_days=N` query param (defaults to 180).

### 4. `infra/aws/cloudformation/tracklist-jobs.yaml` — EventBridge rule

Monthly schedule: 1st of month at 03:00 UTC (low-traffic window, after listening-aggregates and before any billboard activity).

```yaml
ScheduleExpression: cron(0 3 1 * ? *)
```

---

## What queries still work after archival

| Query | Impact |
|-------|--------|
| `get_pending_logs_for_aggregates` (watermark) | ✅ None — only scans recent logs by design |
| Billboard fast path | ✅ None — reads aggregates |
| Listening report fast path | ✅ None — reads aggregates |
| Listening report fallback | ⚠️ Won't see logs > 180 days old — but aggregates cover them, so fallback rarely fires |
| Co-occurrence SQL (90-day window) | ✅ None — archives logs > 180 days, co-occurrence uses 90 days |
| `backfillMissingLogCatalogFromTracks` | ⚠️ Won't backfill logs > 180 days old — acceptable, those logs are already in aggregates |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/164_logs_archive.sql` | New — `logs_archive` table + `archive_old_logs` function |
| `lib/cron/cron-runners.ts` | Add `runArchiveOldLogs` |
| `app/api/cron/archive-old-logs/route.ts` | New cron endpoint |
| `infra/aws/cloudformation/tracklist-jobs.yaml` | Monthly EventBridge rule |
