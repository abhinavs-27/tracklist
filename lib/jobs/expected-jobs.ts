/**
 * Max time (ms) a scheduled job may go without a successful `ok` run before it's "stale".
 *
 * Keys MUST match the `jobName` passed to `startJobRun(...)` in the runner (see
 * `lib/cron/cron-runners.ts`). Only include jobs that (a) actually record `job_runs` and
 * (b) run on a predictable recurring schedule — otherwise the dead-man's-switch false-alarms.
 * Windows are intentionally generous; tighten them once real schedules are confirmed.
 */
export const EXPECTED_JOBS: Record<string, number> = {
  // Daily-ish pipeline jobs — 48h grace.
  listening_aggregates: 48 * 3600_000,
  refresh_stats: 48 * 3600_000,
  lastfm_sync: 48 * 3600_000,
  spotify_enrichment_retry: 48 * 3600_000,
  // Weekly jobs — 8 day grace.
  billboard_weekly_email: 8 * 24 * 3600_000,
  // NOTE: taste_identity_refresh and blind_spots are intentionally NOT monitored here.
  // - taste_identity_refresh fans out to TASTE_IDENTITY_REFRESH_CHUNK invocations that
  //   never call startJobRun, so it records no `ok`/`skipped` row even when it runs —
  //   guaranteeing a false "no successful run on record" alert.
  // - blind_spots runs monthly, which an 8-day window can never satisfy.
  // Both are best-effort garnish (taste screen / blind-spots feature). Re-add with the
  // correct window only after wiring their runners to record job_runs.
};
