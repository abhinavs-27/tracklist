export type LatestOkRun = { job_name: string; started_at: string };
export type ErrorRun = { job_name: string; started_at: string; items_failed: number | null };
export type HealthFinding = { jobName: string; detail: string };

/** Pure: given expected staleness windows and each job's latest `ok` run, return the stale ones. */
export function findStaleJobs(
  expected: Record<string, number>,
  latestOk: LatestOkRun[],
  now: number,
): HealthFinding[] {
  const lastByJob = new Map<string, number>();
  for (const r of latestOk) lastByJob.set(r.job_name, new Date(r.started_at).getTime());

  const stale: HealthFinding[] = [];
  for (const [jobName, maxAge] of Object.entries(expected)) {
    const last = lastByJob.get(jobName);
    if (last === undefined) {
      stale.push({ jobName, detail: "no successful run on record" });
      continue;
    }
    const age = now - last;
    if (age > maxAge) {
      stale.push({
        jobName,
        detail: `last ok run ${Math.round(age / 3600_000)}h ago (limit ${Math.round(
          maxAge / 3600_000,
        )}h)`,
      });
    }
  }
  return stale;
}

/** Pure: collapse recent `error` job_runs into one finding per job with an error count. */
export function summarizeRecentErrors(errors: ErrorRun[]): HealthFinding[] {
  const byJob = new Map<string, { count: number; failed: number; latest: string }>();
  for (const e of errors) {
    const cur = byJob.get(e.job_name);
    if (!cur) {
      byJob.set(e.job_name, {
        count: 1,
        failed: e.items_failed ?? 0,
        latest: e.started_at,
      });
    } else {
      cur.count += 1;
      cur.failed += e.items_failed ?? 0;
      if (e.started_at > cur.latest) cur.latest = e.started_at;
    }
  }
  return Array.from(byJob.entries()).map(([jobName, s]) => ({
    jobName,
    detail: `${s.count} error run(s), ${s.failed} item(s) failed, latest ${s.latest}`,
  }));
}
