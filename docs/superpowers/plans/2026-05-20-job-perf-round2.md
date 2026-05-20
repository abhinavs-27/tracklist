# Job Performance Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the last raw-log scanners in the billboard pipeline, cut three over-scheduled cron jobs, and switch Lambda to ARM/Graviton for 20% cost reduction.

**Architecture:** Two TypeScript changes (skip unnecessary backfill in billboard handler, rewrite community charts to read from `user_listening_aggregates`) plus one CloudFormation edit (cron schedules) and AWS CLI commands (ARM architecture + CloudWatch retention). No new migrations.

**Tech Stack:** TypeScript, Supabase PostgREST, AWS Lambda, AWS CloudFormation, EventBridge.

**Spec:** `docs/superpowers/specs/2026-05-20-job-perf-round2-design.md`

---

## File Map

| File | Change |
|------|--------|
| `lib/jobs/billboard-handlers.ts` | Check aggregate existence before calling `backfillMissingLogCatalogFromTracks` |
| `lib/charts/aggregate-community-weekly-top-10.ts` | Add `aggregateCommunityTop10FromAggregates` fast path; wrap existing function as fallback |
| `infra/aws/cloudformation/tracklist-jobs.yaml` | Update 3 schedule expressions |

---

## Task 1: Skip backfill when aggregates exist

**Files:**
- Modify: `lib/jobs/billboard-handlers.ts`

**Context:** `runGenerateUserBillboard` always calls `backfillMissingLogCatalogFromTracks` before computing charts. That function scans the week's raw `logs` looking for rows missing `album_id`/`artist_id`. When `user_listening_aggregates` already has rows for this user+week, it means the logs were processed previously and catalog IDs are already filled. The backfill is wasted work — ~10s of every ~15s job.

The fix: check `user_listening_aggregates` for one row with this user+week_start. If it exists, skip the backfill. `createJobsSupabaseClient` is the service-role client safe to use in Lambda workers.

- [ ] **Step 1: Read the current file**

```bash
cat lib/jobs/billboard-handlers.ts
```

Expected: imports `backfillMissingLogCatalogFromTracks`, calls it unconditionally before `Promise.all`.

- [ ] **Step 2: Update `lib/jobs/billboard-handlers.ts`**

Replace the full file content with:

```typescript
import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { backfillMissingLogCatalogFromTracks } from "@/lib/logs/backfill-log-catalog-from-tracks";
import { parseBillboardWeek } from "@/lib/jobs/week-window";
import { createJobsSupabaseClient } from "@/lib/jobs/service-role";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * One user × one week: backfill log catalog for that slice (only if aggregates
 * are missing — i.e. this is a first-time compute), then upsert all three chart types.
 * Idempotent via `uq_user_weekly_charts_user_week_type`.
 */
export async function runGenerateUserBillboard(args: {
  userId: string;
  /** Defaults to last completed week when omitted (e.g. manual replay). */
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();
  const weekStartDate = startIso.slice(0, 10); // "YYYY-MM-DD"

  // Only backfill when no aggregate rows exist for this user+week.
  // Presence of aggregates means logs were already processed → catalog IDs are filled.
  const admin = createJobsSupabaseClient();
  const { count } = await admin
    .from("user_listening_aggregates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("week_start", weekStartDate)
    .limit(1);

  if (!count || count === 0) {
    await backfillMissingLogCatalogFromTracks({
      startIso,
      endExclusiveIso: endIso,
      userIds: [args.userId],
    });
  }

  // All 3 chart types are independent — run in parallel for ~3x speedup
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

  return {
    chartsWritten: results.filter((r) => !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
  };
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

  // All 3 chart types are independent — run in parallel
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

  return {
    chartsWritten: results.filter((r) => !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
  };
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
git commit -m "perf: skip log catalog backfill when aggregates already exist for user+week"
```

---

## Task 2: Community charts from `user_listening_aggregates`

**Files:**
- Modify: `lib/charts/aggregate-community-weekly-top-10.ts`

**Context:** `aggregateCommunityWeeklyTop10WithMetrics` calls `fetchCommunityLogsWindow` which paginates raw `logs` for all community members 5000 rows at a time (in chunks of 120 member IDs). For a community with 50 members each listening 200 times/week that's 10K log rows fetched into Lambda memory before any computation.

`user_listening_aggregates` has per-user weekly play counts with `week_start` (Monday UTC). The community metrics we need are all derivable from these rows:
- **total plays per entity**: `SUM(count)` across member rows
- **unique_listeners**: count of distinct user rows for that entity
- **top_contributors**: sort per-user counts descending, take top 3
- **repeat_strength**: `SUM(MIN(count, 3)) / unique_listeners`

`entity_type` mapping: chartType `"tracks"` → `"track"`, `"artists"` → `"artist"`, `"albums"` → `"album"`.

The new function reads aggregates, builds the same data structures as the existing log-iteration code, then feeds them into the existing metrics assembly block. The existing `aggregateCommunityWeeklyTop10WithMetrics` becomes a fallback wrapper.

- [ ] **Step 1: Read the top of the file to understand imports**

```bash
head -25 lib/charts/aggregate-community-weekly-top-10.ts
```

- [ ] **Step 2: Add the fast-path function**

Insert the following function immediately before `aggregateCommunityWeeklyTop10WithMetrics` (around line 140):

```typescript
/**
 * Fast path: reads per-user weekly play counts from user_listening_aggregates.
 * Returns null if no aggregate rows found (triggers log-scan fallback).
 * weekStart must be "YYYY-MM-DD" Monday UTC.
 */
async function aggregateCommunityTop10FromAggregates(args: {
  communityId: string;
  weekStart: string;
  chartType: ChartType;
}): Promise<AggregatedCommunityPlay[] | null> {
  const memberIds = await getCommunityMemberUserIds(args.communityId);
  if (memberIds.length === 0) return [];

  const entityType =
    args.chartType === "tracks"
      ? "track"
      : args.chartType === "artists"
        ? "artist"
        : "album";

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, user_id, count")
    .in("user_id", memberIds)
    .eq("entity_type", entityType)
    .eq("week_start", args.weekStart);

  if (error) {
    console.warn("[community-weekly-chart] aggregates read", error.message);
    return null;
  }
  if (!data?.length) return null;

  // Build per-entity, per-user count map
  const byEntityUser = new Map<string, Map<string, number>>();
  for (const row of data) {
    const r = row as { entity_id: string; user_id: string; count: number };
    let m = byEntityUser.get(r.entity_id);
    if (!m) { m = new Map(); byEntityUser.set(r.entity_id, m); }
    m.set(r.user_id, (m.get(r.user_id) ?? 0) + r.count);
  }

  // Compute totals and rank top 10
  const totals = [...byEntityUser.entries()]
    .map(([entity_id, m]) => ({
      entity_id,
      play_count: [...m.values()].reduce((a, b) => a + b, 0),
      last_played_at: args.weekStart,
    }))
    .sort((a, b) => b.play_count - a.play_count)
    .slice(0, 10);

  if (totals.length === 0) return [];

  const communityActiveUsers = new Set(
    (data as { user_id: string }[]).map((r) => r.user_id),
  ).size;

  // Collect contributor user IDs for username lookup
  const contributorIds: string[] = [];
  for (const row of totals) {
    const m = byEntityUser.get(row.entity_id);
    if (!m) continue;
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([u]) => contributorIds.push(u));
  }
  const nameById = await fetchUsernamesByIds(contributorIds);

  return totals.map((row) => {
    const m = byEntityUser.get(row.entity_id);
    const unique_listeners = m?.size ?? 0;
    const community_listen_percent =
      communityActiveUsers > 0 ? unique_listeners / communityActiveUsers : null;

    const sortedUsers = m
      ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      : [];
    const top_contributors: CommunityChartContributor[] = sortedUsers.map(
      ([user_id, play_count]) => ({
        user_id,
        username: nameById.get(user_id) ?? null,
        play_count,
      }),
    );

    let repeat_strength: number | null = null;
    if (m && unique_listeners > 0) {
      let capped = 0;
      for (const [, plays] of m) capped += Math.min(plays, 3);
      repeat_strength = capped / unique_listeners;
    }

    return {
      ...row,
      unique_listeners,
      community_active_users: communityActiveUsers,
      community_listen_percent,
      repeat_strength,
      top_contributors,
    };
  });
}
```

- [ ] **Step 3: Update `aggregateCommunityWeeklyTop10WithMetrics` to try fast path first**

Find the opening of `aggregateCommunityWeeklyTop10WithMetrics` (currently starts with `const logs = await fetchCommunityLogsWindow(...)`). Replace just the function body's first two lines (the `fetchCommunityLogsWindow` call and the `if (!logs.length) return []` guard) with:

```typescript
export async function aggregateCommunityWeeklyTop10WithMetrics(args: {
  communityId: string;
  startIso: string;
  endExclusiveIso: string;
  chartType: ChartType;
}): Promise<AggregatedCommunityPlay[]> {
  // Fast path: read from pre-aggregated weekly counts (single query vs log pagination)
  const weekStart = args.startIso.slice(0, 10);
  const fromAggregates = await aggregateCommunityTop10FromAggregates({
    communityId: args.communityId,
    weekStart,
    chartType: args.chartType,
  });
  if (fromAggregates !== null) return fromAggregates;

  // Fallback: no aggregate rows — re-aggregate from raw logs
  const logs = await fetchCommunityLogsWindow({
    communityId: args.communityId,
    startIso: args.startIso,
    endExclusiveIso: args.endExclusiveIso,
  });

  if (!logs.length) return [];
```

Then keep the rest of the existing function body unchanged (everything from `const baseTop = await aggregateLogsIntoWeeklyTop10(logs, args.chartType)` onward).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add lib/charts/aggregate-community-weekly-top-10.ts
git commit -m "perf: community charts read from user_listening_aggregates (falls back to logs)"
```

---

## Task 3: CloudFormation — cron schedule + ARM architecture

**Files:**
- Modify: `infra/aws/cloudformation/tracklist-jobs.yaml`

**Context:** Three EventBridge rules fire more often than needed. Changing their `ScheduleExpression` in CloudFormation ensures the schedules persist after any future stack update. The `Architectures` field for Lambda functions is on the Lambda resources, not EventBridge rules — ARM is applied via CLI in Task 4.

- [ ] **Step 1: Update `RuleComputeCooccurrence` schedule**

Find (around line 103–105):
```yaml
      Name: tracklist-cron-compute-cooccurrence
      Description: Daily 00:30 UTC — COMPUTE_COOCCURRENCE
      ScheduleExpression: cron(30 0 * * ? *)
```

Replace with:
```yaml
      Name: tracklist-cron-compute-cooccurrence
      Description: Weekly Sunday 03:30 UTC — COMPUTE_COOCCURRENCE
      ScheduleExpression: cron(30 3 ? * SUN *)
```

- [ ] **Step 2: Update `RuleTasteIdentity` schedule**

Find (around line 129–131):
```yaml
      Name: tracklist-cron-taste-identity
      Description: Daily 00:00 UTC — TASTE_IDENTITY_REFRESH
      ScheduleExpression: cron(0 0 * * ? *)
```

Replace with:
```yaml
      Name: tracklist-cron-taste-identity
      Description: Weekly Monday 00:00 UTC — TASTE_IDENTITY_REFRESH
      ScheduleExpression: cron(0 0 ? * MON *)
```

- [ ] **Step 3: Update `RuleUpgradeLastfmCovers` schedule**

Find (around line 207–209):
```yaml
      Name: tracklist-cron-upgrade-lastfm-album-covers
      Description: Daily 02:50 UTC — UPGRADE_LASTFM_ALBUM_COVERS
      ScheduleExpression: cron(50 2 * * ? *)
```

Replace with:
```yaml
      Name: tracklist-cron-upgrade-lastfm-album-covers
      Description: Monthly 1st 02:50 UTC — UPGRADE_LASTFM_ALBUM_COVERS
      ScheduleExpression: cron(50 2 1 * ? *)
```

- [ ] **Step 4: Verify no other lines were changed**

```bash
git diff infra/aws/cloudformation/tracklist-jobs.yaml
```

Expected: exactly 6 lines changed (3 Description + 3 ScheduleExpression).

- [ ] **Step 5: Commit**

```bash
git add infra/aws/cloudformation/tracklist-jobs.yaml
git commit -m "perf: reduce cron frequency — cooccurrence weekly, taste-identity weekly, album-covers monthly"
```

---

## Task 4: ARM Lambda + CloudWatch retention (AWS CLI)

**Files:** None — AWS console/CLI changes only. No git commit needed (infrastructure state).

**Context:** Lambda ARM/Graviton is 20% cheaper per GB-second. CloudWatch log groups for Lambda functions default to never expiring. These changes apply to the currently-deployed functions and must be re-applied if functions are redeployed from scratch (until the CloudFormation template is extended to manage the Lambda resources directly).

The four Lambda functions are in `us-east-2`, account `437258425098`:
- `billboard-worker`
- `billboard-scheduler`
- `enrich-drain-scheduler`
- `taste-snapshot-scheduler`

- [ ] **Step 1: Switch all Lambda functions to ARM**

```bash
for fn in billboard-worker billboard-scheduler enrich-drain-scheduler taste-snapshot-scheduler; do
  aws lambda update-function-configuration \
    --function-name "$fn" \
    --architectures arm64 \
    --region us-east-2
  echo "Updated $fn to arm64"
done
```

Expected: each prints a JSON response with `"Architectures": ["arm64"]`.

Note: if a function was compiled for x86 and the bundle contains native binaries, this will fail. For Node.js-only bundles (no native addons) it works transparently. If it fails, the function needs to be rebuilt first.

- [ ] **Step 2: Set CloudWatch log retention to 3 days**

```bash
for fn in billboard-worker billboard-scheduler enrich-drain-scheduler taste-snapshot-scheduler; do
  aws logs put-retention-policy \
    --log-group-name "/aws/lambda/$fn" \
    --retention-in-days 3 \
    --region us-east-2
  echo "Set retention for /aws/lambda/$fn"
done
```

Expected: no output on success (AWS CLI returns nothing for successful `put-retention-policy`).

- [ ] **Step 3: Verify ARM switch took effect**

```bash
aws lambda get-function-configuration \
  --function-name billboard-worker \
  --region us-east-2 \
  --query "Architectures"
```

Expected: `["arm64"]`

- [ ] **Step 4: Deploy updated CloudFormation stack**

```bash
aws cloudformation deploy \
  --template-file infra/aws/cloudformation/tracklist-jobs.yaml \
  --stack-name tracklist-jobs \
  --region us-east-2 \
  --capabilities CAPABILITY_IAM
```

Expected: `Successfully created/updated stack - tracklist-jobs`

This applies the new cron schedules to the live EventBridge rules.

---

## Self-Review

**Spec coverage:**
- [x] Skip backfill when aggregates exist → Task 1
- [x] Community charts from aggregates → Task 2
- [x] `compute-cooccurrence` daily → weekly → Task 3
- [x] `taste-identity-refresh` daily → weekly → Task 3
- [x] `upgrade-lastfm-album-covers` daily → monthly → Task 3
- [x] ARM/Graviton Lambda → Task 4
- [x] CloudWatch log retention 3 days → Task 4

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `aggregateCommunityTop10FromAggregates` returns `Promise<AggregatedCommunityPlay[] | null>` — `null` means "no data, use fallback"; `[]` means "community has no members or no activity"
- `AggregatedCommunityPlay`, `CommunityChartContributor` are imported types already used in the file
- `fetchUsernamesByIds` is already defined in `aggregate-community-weekly-top-10.ts`
- `getCommunityMemberUserIds` is already defined in `aggregate-community-weekly-top-10.ts`
- `createSupabaseAdminClient` is already imported at the top of the file
