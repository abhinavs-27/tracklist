# Job Performance Round 2 — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Goal:** Reduce per-job duration and AWS/Supabase compute costs by eliminating the last remaining raw-log scanners, switching to ARM Lambda, and rationalising cron frequency.

---

## Context

Round 1 (earlier today) eliminated the main O(all_logs) patterns: billboard participant discovery, user chart computation, co-occurrence, entity stats, and aggregate ingest now all use pre-aggregated data or SQL RPCs. Three gaps remain:

1. **`backfillMissingLogCatalogFromTracks`** runs on every billboard job regardless of whether it has any work to do. When `user_listening_aggregates` already has rows for the user+week, the logs were already processed and catalog IDs were already filled. The backfill is wasted work.

2. **Community chart computation** still paginates raw `logs` for every member. `user_listening_aggregates` already has per-user weekly counts, making a single grouped query sufficient for all community metrics (total plays, unique listeners, top contributors, repeat strength).

3. **Three cron jobs run more often than needed**, driving unnecessary Supabase DB compute: `compute-cooccurrence` (daily SQL self-join → should be weekly), `upgrade-lastfm-album-covers` (daily → monthly), `taste-identity-refresh` (daily → weekly). `repair-lastfm-aggregates` stays daily because it returns immediately when the queue is empty.

4. **Lambda architecture switch** from x86 to ARM/Graviton — 20% cheaper per GB-second, identical code, single CloudFormation change.

5. **CloudWatch log retention** defaults to Never Expire on Lambda log groups. 3-day retention is sufficient for debugging and eliminates log storage accumulation.

---

## Changes

### 1. Skip backfill when aggregates exist

**File:** `lib/jobs/billboard-handlers.ts`

Before calling `backfillMissingLogCatalogFromTracks`, check whether `user_listening_aggregates` already has any rows for this user + week_start. If yes, skip the backfill entirely.

```typescript
const weekStartDate = window.weekStart.toISOString().slice(0, 10);
const { count } = await admin
  .from("user_listening_aggregates")
  .select("id", { count: "exact", head: true })
  .eq("user_id", args.userId)
  .eq("week_start", weekStartDate)
  .limit(1);

if (!count || count === 0) {
  await backfillMissingLogCatalogFromTracks({ startIso, endExclusiveIso: endIso, userIds: [args.userId] });
}
```

`createJobsSupabaseClient` must be imported (it's already the service-role client used by workers).

**Expected impact:** Billboard user job drops from ~15s to ~3–5s for users with aggregate data (all users after the migration 157 backfill).

---

### 2. Community charts from `user_listening_aggregates`

**File:** `lib/charts/aggregate-community-weekly-top-10.ts`

Replace `fetchCommunityLogsWindow` (paginates raw logs for all members in 5000-row pages) with a single query to `user_listening_aggregates` filtered by member IDs, entity type, and week_start. All community metrics are derivable from per-user aggregate counts:

- **total plays**: `SUM(count)` per entity
- **unique_listeners**: `COUNT(DISTINCT user_id)` per entity
- **top_contributors**: the individual `(user_id, count)` rows before grouping
- **repeat_strength**: `SUM(LEAST(count, 3)) / COUNT(DISTINCT user_id)` per entity

Query shape:
```typescript
const { data } = await admin
  .from("user_listening_aggregates")
  .select("entity_id, user_id, count")
  .in("user_id", memberIds)
  .eq("entity_type", entityType)   // "track" | "artist" | "album"
  .eq("week_start", weekStart)     // "YYYY-MM-DD"
  .order("count", { ascending: false });
```

This returns all per-user rows for the week. The existing TypeScript aggregation logic (bumpUser, repeat_strength, top_contributors) is reused with this data instead of building it from raw logs.

**Fallback:** If the aggregates query returns zero rows, fall back to the existing `fetchCommunityLogsWindow` log scan. This handles communities where aggregates aren't yet populated.

**Expected impact:** Community billboard jobs drop from 30–60s to ~2–3s.

---

### 3. Cron frequency rationalisation

**File:** `infra/aws/cloudformation/tracklist-jobs.yaml`

| Rule | Current schedule | New schedule | Reason |
|------|-----------------|--------------|--------|
| `tracklist-cron-compute-cooccurrence` | `cron(30 0 * * ? *)` (daily) | `cron(30 3 ? * SUN *)` (weekly, Sun 3:30am) | Co-occurrence is stable day-to-day; runs before Sunday billboard fan-out |
| `tracklist-cron-taste-identity` | `cron(0 0 * * ? *)` (daily) | `cron(0 0 ? * MON *)` (weekly, Mon midnight) | Taste vectors change slowly; weekly is sufficient |
| `tracklist-cron-upgrade-lastfm-album-covers` | `cron(50 2 * * ? *)` (daily) | `cron(50 2 1 * ? *)` (monthly, 1st of month) | Album art is static once set |

No other schedule changes. `repair-lastfm-aggregates` stays daily (returns in milliseconds when queue is empty; needed daily when Last.fm backlog builds up).

---

### 4. ARM/Graviton Lambda + CloudWatch retention

**File:** `infra/aws/cloudformation/tracklist-jobs.yaml` and Lambda console

For each Lambda function (`billboard-worker`, `billboard-scheduler`, `enrich-drain-scheduler`, `taste-snapshot-scheduler`):
- Add `Architectures: [arm64]` to the CloudFormation resource definition
- Set CloudWatch log group retention to 3 days

The CloudFormation change ensures ARM persists after future stack updates. The current deployed functions also need to be switched via the AWS console or CLI (`--architectures arm64`). No code changes — the Lambda runtime handles ARM transparently for Node.js.

**Expected impact:** 20% reduction in all Lambda GB-second costs.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/jobs/billboard-handlers.ts` | Add aggregate existence check before backfill |
| `lib/charts/aggregate-community-weekly-top-10.ts` | Replace log scan with aggregates query + fallback |
| `infra/aws/cloudformation/tracklist-jobs.yaml` | Cron schedules + ARM architecture |

No new migrations needed. No schema changes.

---

## Expected Cost After Changes

| Users | Before round 1 | After round 1 | After round 2 |
|-------|---------------|---------------|---------------|
| 40 | ~$220/mo | ~$50–70/mo | ~$30–40/mo |
| 400 | ~$800+/mo | ~$70–120/mo | ~$45–65/mo |
| 4,000 | ruinous | ~$200–400/mo | ~$120–200/mo |
| 40,000 | ruinous | ~$800–2,000/mo | ~$400–700/mo |

Lambda compute at 40K users after round 2: ~$4/month. Supabase DB becomes the cost ceiling at scale.
