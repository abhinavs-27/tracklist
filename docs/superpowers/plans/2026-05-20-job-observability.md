# Job Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `job_runs` Postgres table and a thin `job-logger.ts` helper so every background job records its duration, status, fast-path hit, and item counts — queryable via a lightweight admin endpoint.

**Architecture:** Migration 161 creates the table. `lib/jobs/job-logger.ts` exposes `startJobRun(name, meta?)` which returns a `finish(result)` callback; the callback writes to `job_runs` asynchronously and never throws. Eight job entry points are instrumented with start/finish pairs. A new `GET /api/admin/job-runs` endpoint returns recent runs + per-job summary.

**Tech Stack:** TypeScript, Supabase PostgREST (service role admin client), Next.js Route Handlers.

**Spec:** `docs/superpowers/specs/2026-05-20-job-observability-design.md`

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/161_job_runs.sql` | Create `job_runs` table + indexes |
| `lib/jobs/job-logger.ts` | New — `startJobRun`, `JobRun`, `JobRunResult` types |
| `lib/jobs/billboard-handlers.ts` | Instrument user + community billboard jobs |
| `lib/cron/cron-runners.ts` | Instrument 6 cron functions |
| `app/api/admin/job-runs/route.ts` | New admin endpoint |

---

## Task 1: Migration 161 — `job_runs` table

**Files:**
- Create: `supabase/migrations/161_job_runs.sql`

- [ ] **Step 1: Verify no 161 migration exists yet**

```bash
ls supabase/migrations/ | grep "^161"
# Expected: no output
```

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/161_job_runs.sql
-- Stores one row per background job execution for operational visibility.

CREATE TABLE IF NOT EXISTS job_runs (
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

-- Primary access pattern: recent runs for a specific job
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON job_runs(job_name, started_at DESC);

-- Secondary: all recent runs across jobs
CREATE INDEX IF NOT EXISTS idx_job_runs_started
  ON job_runs(started_at DESC);

ALTER TABLE job_runs DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON job_runs TO service_role;
```

- [ ] **Step 3: Apply migration**

```bash
npx supabase db push
# Expected: migration 161 applied
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/161_job_runs.sql
git commit -m "feat: migration 161 — job_runs table for background job observability"
```

---

## Task 2: `lib/jobs/job-logger.ts`

**Files:**
- Create: `lib/jobs/job-logger.ts`

**Context:** This is the only file all instrumented jobs import. It must never throw — a DB write failure must never affect job correctness. It uses `createSupabaseAdminClient` (service role, safe from Lambda and Vercel). `startJobRun` records `startedAt` and returns a `finish` function that computes `duration_ms` and inserts to `job_runs`.

- [ ] **Step 1: Create `lib/jobs/job-logger.ts`**

```typescript
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type JobRunResult = {
  status: "ok" | "error" | "skipped";
  /** true = aggregates fast path fired; false = fell back to raw logs; omit if N/A */
  fast_path?: boolean;
  items_ok?: number;
  items_failed?: number;
};

export type JobRun = {
  finish(result: JobRunResult): Promise<void>;
};

/**
 * Call at the start of a background job. Returns a finish() callback to call when done.
 * The finish() call writes one row to job_runs asynchronously — never throws.
 *
 * Usage:
 *   const run = await startJobRun("billboard_user", { week_start: "2025-01-06" });
 *   try {
 *     // ... do work ...
 *     void run.finish({ status: "ok", fast_path: true, items_ok: 3 });
 *   } catch (e) {
 *     void run.finish({ status: "error" });
 *     throw e;
 *   }
 */
export async function startJobRun(
  jobName: string,
  meta?: Record<string, unknown>,
): Promise<JobRun> {
  const startedAt = Date.now();

  const finish = async (result: JobRunResult): Promise<void> => {
    const duration_ms = Date.now() - startedAt;
    try {
      const admin = createSupabaseAdminClient();
      await admin.from("job_runs").insert({
        job_name: jobName,
        started_at: new Date(startedAt).toISOString(),
        duration_ms,
        status: result.status,
        fast_path: result.fast_path ?? null,
        items_ok: result.items_ok ?? null,
        items_failed: result.items_failed ?? null,
        meta: meta ?? null,
      });
    } catch (e) {
      // Never let observability writes affect job correctness
      console.warn("[job-logger] failed to write job_run", jobName, e instanceof Error ? e.message : e);
    }
  };

  return { finish };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add lib/jobs/job-logger.ts
git commit -m "feat: job-logger startJobRun helper for job_runs observability"
```

---

## Task 3: Instrument billboard handlers

**Files:**
- Modify: `lib/jobs/billboard-handlers.ts`

**Context:** `runGenerateUserBillboard` already checks `user_listening_aggregates` for the user+week (the `count` query before the backfill decision). If `count > 0`, the fast path will fire inside `aggregateWeeklyTop10`. Use that same `count` check to determine `fast_path`.

`runGenerateCommunityBillboard` has no direct fast-path signal at this call site — use `fast_path: undefined` (omit it).

- [ ] **Step 1: Read the current file**

```bash
cat lib/jobs/billboard-handlers.ts
```

Expected: imports `createJobsSupabaseClient`, has the `count` query for aggregates before the backfill, then `Promise.all` of 3 chart types.

- [ ] **Step 2: Update `lib/jobs/billboard-handlers.ts`**

Full file replacement:

```typescript
import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { backfillMissingLogCatalogFromTracks } from "@/lib/logs/backfill-log-catalog-from-tracks";
import { parseBillboardWeek } from "@/lib/jobs/week-window";
import { createJobsSupabaseClient } from "@/lib/jobs/service-role";
import { startJobRun } from "@/lib/jobs/job-logger";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * One user × one week: backfill log catalog for that slice (only if aggregates
 * are missing — i.e. this is a first-time compute), then upsert all three chart types.
 * Idempotent via `uq_user_weekly_charts_user_week_type`.
 */
export async function runGenerateUserBillboard(args: {
  userId: string;
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();
  const weekStartDate = startIso.slice(0, 10);

  const run = await startJobRun("billboard_user", {
    user_id: args.userId,
    week_start: weekStartDate,
  });

  try {
    const admin = createJobsSupabaseClient();
    const { count } = await admin
      .from("user_listening_aggregates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("week_start", weekStartDate)
      .limit(1);

    const fastPath = (count ?? 0) > 0;

    if (!fastPath) {
      await backfillMissingLogCatalogFromTracks({
        startIso,
        endExclusiveIso: endIso,
        userIds: [args.userId],
      });
    }

    const results = await Promise.all(
      CHART_TYPES.map((chartType) =>
        computeWeeklyChart({
          userId: args.userId,
          weekStart: window.weekStart,
          weekEndExclusive: window.weekEndExclusive,
          chartType,
        }),
      ),
    );

    const chartsWritten = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    void run.finish({ status: "ok", fast_path: fastPath, items_ok: chartsWritten, items_failed: skipped });
    return { chartsWritten, skipped };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

/**
 * One community × one week: upsert all three chart types.
 * Idempotent via `uq_community_weekly_charts_community_week_type`.
 */
export async function runGenerateCommunityBillboard(args: {
  communityId: string;
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  const weekStartDate = window.weekStart.toISOString().slice(0, 10);
  const run = await startJobRun("billboard_community", {
    community_id: args.communityId,
    week_start: weekStartDate,
  });

  try {
    const results = await Promise.all(
      CHART_TYPES.map((chartType) =>
        computeCommunityWeeklyChart({
          communityId: args.communityId,
          weekStart: window.weekStart,
          weekEndExclusive: window.weekEndExclusive,
          chartType,
        }),
      ),
    );

    const chartsWritten = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    void run.finish({ status: "ok", items_ok: chartsWritten, items_failed: skipped });
    return { chartsWritten, skipped };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add lib/jobs/billboard-handlers.ts
git commit -m "feat: instrument billboard handlers with job_runs observability"
```

---

## Task 4: Instrument cron runners

**Files:**
- Modify: `lib/cron/cron-runners.ts`

**Context:** Six functions need `startJobRun`/`finish` pairs added. In each case:
1. Call `startJobRun` at the top of the function body (before any work)
2. Call `void run.finish(...)` with the result just before the `return` statement
3. Wrap the entire body in try/catch so errors also call `run.finish({ status: "error" })` before rethrowing

Add the import at the top: `import { startJobRun } from "@/lib/jobs/job-logger";`

**The six functions and their finish payloads:**

### `runTasteIdentityRefresh` (around line 256)

Find the `return { ok: true, attempted, processed, failures }` at the end. Wrap the function body:

```typescript
export async function runTasteIdentityRefresh(): Promise<{
  ok: true;
  attempted: number;
  processed: number;
  failures: number;
}> {
  const run = await startJobRun("taste_identity_refresh");
  try {
    const userIds = await resolveTasteIdentityCronUserIds();
    let processed = 0;
    let failures = 0;

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

    void run.finish({ status: "ok", items_ok: processed, items_failed: failures });
    return { ok: true, attempted: userIds.length, processed, failures };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

### `runRefreshStats` (around line 71)

Add at the top of the function body: `const run = await startJobRun("refresh_stats");`
Just before `return { ok: true, ... }`: `void run.finish({ status: "ok" });`
Add catch: `void run.finish({ status: "error" }); throw e;`

### `runComputeCooccurrence` (around line 182)

```typescript
export async function runComputeCooccurrence(): Promise<{ ok: true; songs: { pairs_written: number }; albums: { pairs_written: number } }> {
  const run = await startJobRun("compute_cooccurrence");
  try {
    const admin = createSupabaseAdminClient();
    const { data: songData, error: songErr } = await admin.rpc("compute_song_cooccurrence_in_db");
    if (songErr) throw new Error(songErr.message);
    const { data: albumData, error: albumErr } = await admin.rpc("compute_album_cooccurrence_in_db");
    if (albumErr) throw new Error(albumErr.message);

    const songs = { pairs_written: (songData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0 };
    const albums = { pairs_written: (albumData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0 };

    console.log(LOG, "co-occurrence done", { songs, albums });
    void run.finish({ status: "ok", items_ok: songs.pairs_written + albums.pairs_written });
    return { ok: true, songs, albums };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

### `runBillboardWeeklyEmail` (around line 298)

Add at the top: `const run = await startJobRun("billboard_weekly_email", { week_start: "" });` — update the meta after `weekStart` is resolved:

Actually, since `weekStart` is resolved mid-function, just add at the top:
`const run = await startJobRun("billboard_weekly_email");`

Just before the final `return { ok: true, ... }`:
```typescript
void run.finish({ status: sent > 0 ? "ok" : "skipped", items_ok: sent, items_failed: sendFailed });
```

Add catch wrap around the main body.

### `runListeningAggregates` (around line 448)

```typescript
export async function runListeningAggregates(): Promise<
  Awaited<ReturnType<typeof updateListeningAggregates>> & { ok: true }
> {
  const run = await startJobRun("listening_aggregates");
  try {
    const result = await updateListeningAggregates();
    void run.finish({
      status: result.processed > 0 ? "ok" : "skipped",
      items_ok: result.processed,
      items_failed: result.errors,
    });
    return { ok: true, ...result };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

### `runRefreshBlindSpots` (around line 496)

Add at top: `const run = await startJobRun("blind_spots");`
Just before `return { ok: true, ... }`: `void run.finish({ status: "ok", items_ok: processed, items_failed: errors });`
Add catch wrap.

- [ ] **Step 1: Add import to top of `lib/cron/cron-runners.ts`**

Find the last import line at the top of the file and add after it:
```typescript
import { startJobRun } from "@/lib/jobs/job-logger";
```

- [ ] **Step 2: Apply all 6 function wraps as described above**

Use the Edit tool for each function. The key pattern for each is:
- Add `const run = await startJobRun("job_name"[, meta]);` as the first line of the function body
- Add `void run.finish({ status: "ok", ... })` just before each `return`  
- Wrap with try/catch that calls `void run.finish({ status: "error" }); throw e;`

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add lib/cron/cron-runners.ts
git commit -m "feat: instrument cron runners with job_runs observability"
```

---

## Task 5: Admin endpoint

**Files:**
- Create: `app/api/admin/job-runs/route.ts`

**Context:** Protected by `CRON_SECRET` (same Bearer token as other cron endpoints — already in env). Returns `runs` (raw rows, newest first) and `summary` (per-job aggregation from a single SQL query). Uses `createSupabaseAdminClient`.

The `since` param defaults to 7 days ago. Valid shorthand: `7d`, `30d`, `90d`. Otherwise treated as an ISO date string.

- [ ] **Step 1: Create `app/api/admin/` directory (it may not exist)**

```bash
mkdir -p app/api/admin/job-runs
```

- [ ] **Step 2: Create `app/api/admin/job-runs/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiBadRequest } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function parseSince(raw: string | null): string {
  if (!raw) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "7d")  return new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "30d") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "90d") return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const d = new Date(raw);
  if (isNaN(d.getTime())) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const jobFilter = searchParams.get("job");
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(500, Math.max(1, isNaN(limitRaw) ? 50 : limitRaw));
  const since = parseSince(searchParams.get("since"));

  const admin = createSupabaseAdminClient();

  // Fetch raw runs
  let query = admin
    .from("job_runs")
    .select("id, job_name, started_at, duration_ms, status, fast_path, items_ok, items_failed, meta")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (jobFilter) query = query.eq("job_name", jobFilter);

  const { data: runs, error: runsErr } = await query;
  if (runsErr) {
    console.error("[admin/job-runs] fetch runs", runsErr.message);
    return apiBadRequest("Failed to fetch job runs");
  }

  // Build summary from the fetched rows (avoids a second DB query)
  const summaryMap = new Map<string, {
    runs: number; ok: number; error: number; skipped: number;
    total_ms: number; fast_path_hits: number; fast_path_total: number;
  }>();

  for (const row of runs ?? []) {
    const r = row as {
      job_name: string; status: string; duration_ms: number | null;
      fast_path: boolean | null;
    };
    let s = summaryMap.get(r.job_name);
    if (!s) {
      s = { runs: 0, ok: 0, error: 0, skipped: 0, total_ms: 0, fast_path_hits: 0, fast_path_total: 0 };
      summaryMap.set(r.job_name, s);
    }
    s.runs += 1;
    if (r.status === "ok") s.ok += 1;
    else if (r.status === "error") s.error += 1;
    else s.skipped += 1;
    if (r.duration_ms != null) s.total_ms += r.duration_ms;
    if (r.fast_path != null) {
      s.fast_path_total += 1;
      if (r.fast_path) s.fast_path_hits += 1;
    }
  }

  const summary: Record<string, {
    runs: number; ok: number; error: number; skipped: number;
    avg_ms: number; fast_path_rate: number | null;
  }> = {};

  for (const [name, s] of summaryMap) {
    summary[name] = {
      runs: s.runs,
      ok: s.ok,
      error: s.error,
      skipped: s.skipped,
      avg_ms: s.runs > 0 ? Math.round(s.total_ms / s.runs) : 0,
      fast_path_rate: s.fast_path_total > 0
        ? Math.round((s.fast_path_hits / s.fast_path_total) * 100) / 100
        : null,
    };
  }

  return apiOk({ runs: runs ?? [], summary });
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Smoke test the endpoint locally**

```bash
npm run dev &
sleep 3
curl -s -H "Authorization: Bearer ${CRON_SECRET}" \
  "http://localhost:3000/api/admin/job-runs?since=30d&limit=10" | python3 -m json.tool | head -20
```

Expected: JSON with `{ "runs": [], "summary": {} }` (empty since no jobs have run yet with the new logger).

Kill the dev server after testing.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/job-runs/route.ts
git commit -m "feat: GET /api/admin/job-runs endpoint for job observability"
```

---

## Self-Review

**Spec coverage:**
- [x] Migration 161 `job_runs` table → Task 1
- [x] `lib/jobs/job-logger.ts` with `startJobRun`/`finish` → Task 2
- [x] `billboard_user` instrumented with `fast_path` → Task 3
- [x] `billboard_community` instrumented → Task 3
- [x] `listening_aggregates` instrumented → Task 4
- [x] `taste_identity_refresh` instrumented → Task 4
- [x] `refresh_stats` instrumented → Task 4
- [x] `compute_cooccurrence` instrumented → Task 4
- [x] `billboard_weekly_email` instrumented → Task 4
- [x] `blind_spots` instrumented → Task 4
- [x] `GET /api/admin/job-runs` with auth, filtering, summary → Task 5

**Type consistency:**
- `JobRunResult` defined in Task 2, used exactly in Tasks 3 and 4 — ✓
- `startJobRun` returns `Promise<JobRun>`, `JobRun.finish` takes `JobRunResult` — ✓
- `fast_path: boolean | undefined` in `JobRunResult` maps to `fast_path: boolean | null` in DB via `?? null` — ✓

**Placeholder scan:** None found. All code blocks complete.

**Caution:** Task 4 requires editing 6 separate functions in `lib/cron/cron-runners.ts`. The implementer should edit them one at a time and run typecheck after all 6 are done. The `runRefreshStats` function is the longest (~100 lines) — the try/catch wrap needs to cover all of its internal logic including the `populate_precomputed_caches` and catalog hydration steps, not just the first DB call.
