# Logs Archival — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move logs older than 180 days to `logs_archive` monthly, keeping the hot `logs` table small as the platform scales.

**Architecture:** Migration 164 creates `logs_archive` + `archive_old_logs` SQL function. A new `ARCHIVE_OLD_LOGS` message type wires through `lib/jobs/types.ts` and `lib/jobs/run-job.ts`. `runArchiveOldLogs` in `cron-runners.ts` calls the RPC. A cron route + CloudFormation EventBridge rule (monthly, 1st at 3am UTC) completes the pipeline. The DELETE from `logs` cascades to `user_listening_aggregate_ingest` automatically.

**Tech Stack:** TypeScript, Supabase PostgREST, AWS EventBridge, Postgres SQL.

**Spec:** `docs/superpowers/specs/2026-05-20-logs-archival-design.md`

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/164_logs_archive.sql` | New — table + SQL function |
| `lib/jobs/types.ts` | Add `ARCHIVE_OLD_LOGS` to `CronJobMessage` union |
| `lib/jobs/run-job.ts` | Add `case "ARCHIVE_OLD_LOGS"` handler |
| `lib/cron/cron-runners.ts` | Add `runArchiveOldLogs` |
| `app/api/cron/archive-old-logs/route.ts` | New cron endpoint |
| `infra/aws/cloudformation/tracklist-jobs.yaml` | Monthly EventBridge rule |

---

## Task 1: Migration 164 — `logs_archive` + `archive_old_logs`

**Files:**
- Create: `supabase/migrations/164_logs_archive.sql`

- [ ] **Step 1: Verify no 164 migration exists**

```bash
ls supabase/migrations/ | grep "^164"
# Expected: no output
```

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/164_logs_archive.sql
-- Archive table for logs older than 180 days.
-- Rows are moved here monthly by archive_old_logs() to keep the hot logs table small.
-- No FK from user_listening_aggregate_ingest (that tracking table uses cascade on logs).

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

CREATE INDEX IF NOT EXISTS idx_logs_archive_user_listened
  ON logs_archive(user_id, listened_at DESC);

ALTER TABLE logs_archive DISABLE ROW LEVEL SECURITY;

-- Atomically move one batch of old logs to logs_archive.
-- DELETE FROM logs cascades to user_listening_aggregate_ingest automatically.
-- Idempotent: ON CONFLICT DO NOTHING skips rows already archived.
CREATE OR REPLACE FUNCTION archive_old_logs(
  p_cutoff_days INT DEFAULT 180,
  p_batch_size  INT DEFAULT 5000
)
RETURNS TABLE(archived INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_cutoff_days || ' days')::INTERVAL;
  v_count  INT;
BEGIN
  SET LOCAL statement_timeout = '120s';

  WITH to_archive AS (
    SELECT id FROM logs
    WHERE listened_at < v_cutoff
    ORDER BY listened_at ASC, id ASC
    LIMIT p_batch_size
  ),
  moved AS (
    INSERT INTO logs_archive
    SELECT l.*
    FROM logs l
    JOIN to_archive t ON t.id = l.id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  DELETE FROM logs l
  USING moved m
  WHERE l.id = m.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  archived := v_count;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_old_logs(INT, INT) TO service_role;
```

- [ ] **Step 3: Typecheck (SQL only)**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/164_logs_archive.sql
git commit -m "feat: migration 164 — logs_archive table + archive_old_logs() function"
```

---

## Task 2: Wire `ARCHIVE_OLD_LOGS` into the job pipeline

**Files:**
- Modify: `lib/jobs/types.ts`
- Modify: `lib/jobs/run-job.ts`
- Modify: `lib/cron/cron-runners.ts`

**Context:** Every cron job follows the same pipeline: EventBridge → SQS message with `type` field → `run-job.ts` switch → `cron-runners.ts` function. Adding a new job type requires updating all three files.

- [ ] **Step 1: Add `ARCHIVE_OLD_LOGS` to `CronJobMessage` in `lib/jobs/types.ts`**

Find the `CronJobMessage` union type. Add before the closing `|` (after `DRAIN_ENRICH_BACKLOG`):

```typescript
  | { type: "ARCHIVE_OLD_LOGS"; cutoff_days?: number };
```

- [ ] **Step 2: Add the case to `lib/jobs/run-job.ts`**

Find the `case "DRAIN_ENRICH_BACKLOG":` block. Add a new case after it:

```typescript
      case "ARCHIVE_OLD_LOGS":
        await cron.runArchiveOldLogs(job.cutoff_days);
        break;
```

- [ ] **Step 3: Add `runArchiveOldLogs` to `lib/cron/cron-runners.ts`**

Add this function at the end of the file (before any final export if present):

```typescript
export async function runArchiveOldLogs(
  cutoffDays = 180,
): Promise<{ ok: true; archived: number }> {
  const capped = Math.min(365, Math.max(30, cutoffDays));
  const run = await startJobRun("archive_old_logs", { cutoff_days: capped });
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("archive_old_logs", {
      p_cutoff_days: capped,
      p_batch_size:  5000,
    });
    if (error) throw new Error(error.message);
    const archived =
      (data?.[0] as { archived: number } | undefined)?.archived ?? 0;
    console.log(LOG, "archive_old_logs done", { archived });
    void run.finish({ status: archived > 0 ? "ok" : "skipped", items_ok: archived });
    return { ok: true, archived };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/types.ts lib/jobs/run-job.ts lib/cron/cron-runners.ts
git commit -m "feat: ARCHIVE_OLD_LOGS job type — wires types, run-job, and cron-runners"
```

---

## Task 3: Cron endpoint + CloudFormation rule

**Files:**
- Create: `app/api/cron/archive-old-logs/route.ts`
- Modify: `infra/aws/cloudformation/tracklist-jobs.yaml`

- [ ] **Step 1: Create `app/api/cron/archive-old-logs/route.ts`**

```typescript
import { apiError, apiOk } from "@/lib/api-response";
import { runArchiveOldLogs } from "@/lib/cron/cron-runners";

/**
 * Monthly: move logs older than 180 days to logs_archive.
 * Production schedule: EventBridge → SQS (1st of month, 03:00 UTC).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cutoffDays = Math.min(
      365,
      Math.max(30, parseInt(searchParams.get("cutoff_days") ?? "180", 10) || 180),
    );
    const result = await runArchiveOldLogs(cutoffDays);
    return apiOk(result);
  } catch (e) {
    console.error("[cron archive-old-logs]", e);
    return apiError(e instanceof Error ? e.message : "archive failed", 500);
  }
}
```

- [ ] **Step 2: Add EventBridge rule to `infra/aws/cloudformation/tracklist-jobs.yaml`**

Find `RuleUpgradeLastfmCovers` (the last rule before `BillboardWeeklyScheduleRule`). Add a new rule block **after** `RuleUpgradeLastfmCovers` and before `BillboardWeeklyScheduleRule`:

```yaml
  RuleArchiveOldLogs:
    Type: AWS::Events::Rule
    Properties:
      Name: tracklist-cron-archive-old-logs
      Description: Monthly 1st 03:00 UTC — ARCHIVE_OLD_LOGS
      ScheduleExpression: cron(0 3 1 * ? *)
      State: ENABLED
      Targets:
        - Id: SqsArchiveLogs
          Arn: !GetAtt CronJobsQueue.Arn
          RoleArn: !GetAtt EventBridgeRole.Arn
          Input: '{"type":"ARCHIVE_OLD_LOGS","cutoff_days":180}'
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/archive-old-logs/route.ts infra/aws/cloudformation/tracklist-jobs.yaml
git commit -m "feat: archive-old-logs cron endpoint + monthly EventBridge rule"
```

---

## Task 4: Apply migration + deploy EventBridge rule

**Files:** None (infrastructure only)

- [ ] **Step 1: Apply migration to production**

```bash
npx supabase db push
# Expected: migration 164 applied
```

- [ ] **Step 2: Verify function exists in Supabase SQL editor**

```sql
SELECT archive_old_logs(180, 100);
-- Expected: returns one row with archived = N (the number of logs > 180 days old, up to 100)
-- At 31K logs of mostly recent data, this will likely return 0 or a small number
```

- [ ] **Step 3: Deploy updated EventBridge rule via AWS CLI**

```bash
export AWS_REGION=us-east-2
# (credentials loaded from .env or aws-vault — do not hardcode here)

aws events put-rule \
  --name tracklist-cron-archive-old-logs \
  --schedule-expression "cron(0 3 1 * ? *)" \
  --description "Monthly 1st 03:00 UTC — ARCHIVE_OLD_LOGS" \
  --state ENABLED \
  --region us-east-2

aws events put-targets \
  --rule tracklist-cron-archive-old-logs \
  --region us-east-2 \
  --targets '[{
    "Id": "SqsArchiveLogs",
    "Arn": "arn:aws:sqs:us-east-2:437258425098:tracklist-cron-jobs",
    "Input": "{\"type\":\"ARCHIVE_OLD_LOGS\",\"cutoff_days\":180}"
  }]'
```

Expected: first command returns a RuleArn JSON, second returns `{ "FailedEntryCount": 0 }`.

- [ ] **Step 4: Push code to Vercel**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- [x] `logs_archive` table with user FK, no ingest FK → Task 1
- [x] `archive_old_logs(cutoff_days, batch_size)` SQL function, atomic CTE → Task 1
- [x] `GRANT EXECUTE TO service_role` → Task 1
- [x] `runArchiveOldLogs` in `cron-runners.ts` with `startJobRun` instrumentation → Task 2
- [x] `ARCHIVE_OLD_LOGS` type in `CronJobMessage` union → Task 2
- [x] `case "ARCHIVE_OLD_LOGS"` in `run-job.ts` → Task 2
- [x] `app/api/cron/archive-old-logs/route.ts` endpoint → Task 3
- [x] Monthly EventBridge rule `cron(0 3 1 * ? *)` → Task 3 + 4
- [x] Migration applied to production → Task 4
- [x] EventBridge rule live → Task 4

**Type consistency:**
- `CronJobMessage` union in `types.ts` has `cutoff_days?: number` — matches `run-job.ts` usage of `job.cutoff_days` ✓
- `runArchiveOldLogs(cutoffDays = 180)` matches `run-job.ts` call `cron.runArchiveOldLogs(job.cutoff_days)` — `undefined` from optional field passes as default correctly ✓
- `archive_old_logs` RPC called with `{ p_cutoff_days, p_batch_size }` matches SQL function signature ✓

**Placeholder scan:** None found.

**Caution — Task 4 Step 3:** The `put-targets` command uses the SQS queue URL as the ARN. For SQS targets in EventBridge, the ARN format is `arn:aws:sqs:us-east-2:437258425098:tracklist-cron-jobs` not the HTTPS URL. Use `aws sqs get-queue-attributes --queue-url ... --attribute-names QueueArn` to get the correct ARN first, or use the ARN directly if known.
