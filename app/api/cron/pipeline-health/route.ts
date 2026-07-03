import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { EXPECTED_JOBS } from "@/lib/jobs/expected-jobs";
import {
  findStaleJobs,
  summarizeRecentErrors,
  type LatestOkRun,
  type ErrorRun,
} from "@/lib/jobs/check-pipeline-health";
import { sendJobAlert } from "@/lib/jobs/alert";

/** How far back to scan for `error` runs. */
const ERROR_LOOKBACK_MS = 24 * 3600_000;

/**
 * Dead-man's-switch + error watch. Alerts when an EXPECTED_JOBS entry has no recent `ok`
 * run, or when any job recorded an `error` in the last 24h. The runners already record
 * `job_runs` via startJobRun — this endpoint just watches that data and alerts.
 *
 * Schedule every few hours (EventBridge/Vercel cron). Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  try {
    const admin = createSupabaseAdminClient();
    const now = Date.now();
    const jobNames = Object.keys(EXPECTED_JOBS);
    const maxWindow = Math.max(...Object.values(EXPECTED_JOBS));
    const okSince = new Date(now - maxWindow - 3600_000).toISOString();

    // 1. Latest ok run per expected job (for staleness).
    const { data: okRows, error: okErr } = await admin
      .from("job_runs")
      .select("job_name, started_at")
      .eq("status", "ok")
      .in("job_name", jobNames)
      .gte("started_at", okSince)
      .order("started_at", { ascending: false });
    if (okErr) return apiError(okErr.message, 500);

    const seen = new Set<string>();
    const latestOk: LatestOkRun[] = [];
    for (const row of okRows ?? []) {
      const r = row as LatestOkRun;
      if (!seen.has(r.job_name)) {
        seen.add(r.job_name);
        latestOk.push(r);
      }
    }

    // 2. Recent error runs across all jobs.
    const errSince = new Date(now - ERROR_LOOKBACK_MS).toISOString();
    const { data: errRows, error: errErr } = await admin
      .from("job_runs")
      .select("job_name, started_at, items_failed")
      .eq("status", "error")
      .gte("started_at", errSince)
      .order("started_at", { ascending: false });
    if (errErr) return apiError(errErr.message, 500);

    const stale = findStaleJobs(EXPECTED_JOBS, latestOk, now);
    const errors = summarizeRecentErrors((errRows ?? []) as ErrorRun[]);

    for (const s of stale) {
      void sendJobAlert({ jobName: s.jobName, kind: "stale", detail: s.detail });
    }
    for (const e of errors) {
      void sendJobAlert({ jobName: e.jobName, kind: "error", detail: e.detail });
    }

    return apiOk({ checked: jobNames.length, stale, errors });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "pipeline-health failed", 500);
  }
}
