# Job Observability — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Goal:** Make background job health visible — duration, fast-path vs fallback rate, error rate — via a `job_runs` Postgres table queryable from Supabase and a lightweight admin endpoint.

---

## Context

All background jobs (billboard computation, aggregate ingest, taste identity, co-occurrence, etc.) log unstructured strings to CloudWatch and Vercel logs. There is no way to answer "did the billboard job use the aggregates fast path last Sunday?", "what's the average taste identity duration?", or "how many jobs errored this week?" without digging through log search.

---

## Architecture

Three components:

1. **Migration 161** — `job_runs` table in Postgres
2. **`lib/jobs/job-logger.ts`** — thin helper that wraps a job in a `startJobRun` / `finish` pair; writes to `job_runs` asynchronously (never throws, never slows the job)
3. **`GET /api/admin/job-runs`** — admin endpoint returning recent runs, protected by `CRON_SECRET`

Jobs are instrumented at the call-site in `lib/jobs/billboard-handlers.ts`, `lib/cron/cron-runners.ts`, and `lib/analytics/updateListeningAggregates.ts`. No changes to the job logic itself — instrumentation is a thin wrap.

---

## Migration 161 — `job_runs` table

```sql
CREATE TABLE job_runs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms  INT,
  status       TEXT        NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  fast_path    BOOLEAN,
  items_ok     INT,
  items_failed INT,
  meta         JSONB
);

CREATE INDEX idx_job_runs_name_started ON job_runs(job_name, started_at DESC);
CREATE INDEX idx_job_runs_started      ON job_runs(started_at DESC);

ALTER TABLE job_runs DISABLE ROW LEVEL SECURITY;
```

**Column semantics:**

| Column | Meaning |
|--------|---------|
| `job_name` | Stable identifier: `billboard_user`, `billboard_community`, `listening_aggregates`, `taste_identity_refresh`, `refresh_stats`, `compute_cooccurrence`, `billboard_weekly_email`, `blind_spots` |
| `duration_ms` | Wall-clock milliseconds for the full job. NULL if the job errored before completing. |
| `status` | `ok` = completed successfully; `error` = threw or returned error; `skipped` = job had nothing to do (e.g. no pending logs) |
| `fast_path` | `true` = read from `user_listening_aggregates`; `false` = fell back to raw log scan; `null` = not applicable for this job |
| `items_ok` | Unit depends on job: charts written (billboard), logs ingested (aggregates), users processed (taste identity), pairs written (co-occurrence), emails sent (billboard email) |
| `items_failed` | Count of individual failures within a job run (e.g. users that errored in taste identity batch) |
| `meta` | JSONB bag for job-specific context: `{ week_start, userId, communityId, batch_size, ... }` |

**Retention:** rows accumulate indefinitely; a future cron can prune rows older than 90 days. Not worth building now at current scale.

---

## `lib/jobs/job-logger.ts`

```typescript
export type JobRunResult = {
  status: "ok" | "error" | "skipped";
  fast_path?: boolean;
  items_ok?: number;
  items_failed?: number;
  duration_ms?: number;
};

export type JobRun = {
  finish(result: JobRunResult): Promise<void>;
};

export async function startJobRun(
  jobName: string,
  meta?: Record<string, unknown>,
): Promise<JobRun> { ... }
```

`startJobRun`:
- Records `startedAt = Date.now()`
- Returns a `{ finish }` object

`finish(result)`:
- Computes `duration_ms = Date.now() - startedAt` (unless caller provides it)
- Inserts one row into `job_runs` via the service-role admin client
- **Never throws** — wraps the insert in try/catch and logs a warning on failure. The job result is never affected by an observability write failure.
- Fire-and-forget: returns a Promise but callers do not need to await it (they can, but shouldn't block on it)

Uses `createSupabaseAdminClient` (service role, bypasses RLS). Safe to call from Lambda workers and Vercel functions alike.

---

## Instrumented Jobs

### `runGenerateUserBillboard` (`lib/jobs/billboard-handlers.ts`)

```typescript
const run = await startJobRun("billboard_user", { week_start: weekStartDate, user_id: args.userId });
try {
  // ... existing logic ...
  void run.finish({ status: "ok", fast_path: usedFastPath, items_ok: chartsWritten, items_failed: skipped });
} catch (e) {
  void run.finish({ status: "error" });
  throw e;
}
```

`usedFastPath`: derived from the aggregate existence check already in `billboard-handlers.ts` (the `count` query before the backfill decision — if `count > 0`, `fast_path = true`).

### `runGenerateCommunityBillboard` (`lib/jobs/billboard-handlers.ts`)

Same pattern. `fast_path` is not directly available (it's inside `aggregateCommunityTop10FromAggregates`). For community jobs, `fast_path = null` (not tracked at this level — community fast path is logged via `console.warn` on fallback already).

### `runListeningAggregates` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("listening_aggregates", { batch_size: batchSize });
// ... existing logic returns { processed, skipped, errors } ...
void run.finish({ status: processed > 0 || skipped ? "ok" : "skipped", items_ok: processed, items_failed: errors });
```

### `runTasteIdentityRefresh` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("taste_identity_refresh");
// ...
void run.finish({ status: "ok", items_ok: processed, items_failed: failures });
```

### `runRefreshStats` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("refresh_stats");
// ...
void run.finish({ status: "ok" });
```

### `runComputeCooccurrence` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("compute_cooccurrence");
// ...
void run.finish({ status: "ok", items_ok: songs.pairs_written + albums.pairs_written });
```

### `runBillboardWeeklyEmail` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("billboard_weekly_email", { week_start: weekStart });
// ...
void run.finish({ status: sent > 0 ? "ok" : "skipped", items_ok: sent, items_failed: sendFailed });
```

### `runRefreshBlindSpots` (`lib/cron/cron-runners.ts`)

```typescript
const run = await startJobRun("blind_spots");
// ...
void run.finish({ status: "ok", items_ok: processed, items_failed: errors });
```

---

## Admin Endpoint — `GET /api/admin/job-runs`

**File:** `app/api/admin/job-runs/route.ts`

**Auth:** `Authorization: Bearer {CRON_SECRET}` — reuses the same secret already in the system.

**Query params:**
- `job` — filter by job_name (optional)
- `limit` — number of rows (default 50, max 500)
- `since` — ISO date or `7d` / `30d` shorthand (default `7d`)

**Response shape:**

```json
{
  "runs": [
    {
      "id": "...",
      "job_name": "billboard_user",
      "started_at": "2026-05-18T05:03:12Z",
      "duration_ms": 4821,
      "status": "ok",
      "fast_path": true,
      "items_ok": 3,
      "items_failed": 0,
      "meta": { "week_start": "2026-05-11", "user_id": "..." }
    }
  ],
  "summary": {
    "billboard_user":    { "runs": 160, "ok": 158, "error": 2, "avg_ms": 4900, "fast_path_rate": 0.99 },
    "listening_aggregates": { "runs": 7, "ok": 7, "error": 0, "avg_ms": 1200 }
  }
}
```

The `summary` is computed in SQL via a single aggregation query (not N+1). Uses `createSupabaseAdminClient`.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/161_job_runs.sql` | Create `job_runs` table + indexes |
| `lib/jobs/job-logger.ts` | New file — `startJobRun` / `JobRun` / `JobRunResult` |
| `lib/jobs/billboard-handlers.ts` | Instrument `runGenerateUserBillboard`, `runGenerateCommunityBillboard` |
| `lib/cron/cron-runners.ts` | Instrument 6 cron runner functions |
| `app/api/admin/job-runs/route.ts` | New admin endpoint |

No schema changes beyond migration 161. No new dependencies.
