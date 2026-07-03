import { describe, it, expect } from "vitest";
import {
  findStaleJobs,
  summarizeRecentErrors,
  type LatestOkRun,
  type ErrorRun,
} from "./check-pipeline-health";

describe("findStaleJobs", () => {
  const now = new Date("2026-07-03T00:00:00Z").getTime();
  const expected = { job_a: 3600_000, job_b: 3600_000 }; // 1h each

  it("flags a job whose last ok run is older than its window", () => {
    const latest: LatestOkRun[] = [
      { job_name: "job_a", started_at: new Date(now - 30 * 60_000).toISOString() }, // 30m, fresh
      { job_name: "job_b", started_at: new Date(now - 2 * 3600_000).toISOString() }, // 2h, stale
    ];
    const stale = findStaleJobs(expected, latest, now);
    expect(stale.map((s) => s.jobName)).toEqual(["job_b"]);
    expect(stale[0].detail).toContain("2h");
  });

  it("flags a job that has never run", () => {
    const stale = findStaleJobs({ job_c: 3600_000 }, [], now);
    expect(stale.map((s) => s.jobName)).toEqual(["job_c"]);
    expect(stale[0].detail).toContain("no successful run");
  });

  it("returns nothing when all jobs are fresh", () => {
    const latest: LatestOkRun[] = [
      { job_name: "job_a", started_at: new Date(now - 10 * 60_000).toISOString() },
      { job_name: "job_b", started_at: new Date(now - 10 * 60_000).toISOString() },
    ];
    expect(findStaleJobs(expected, latest, now)).toEqual([]);
  });
});

describe("summarizeRecentErrors", () => {
  it("dedupes error runs by job name with a count", () => {
    const errors: ErrorRun[] = [
      { job_name: "lastfm_sync", started_at: "2026-07-03T01:00:00Z", items_failed: 4 },
      { job_name: "lastfm_sync", started_at: "2026-07-03T00:00:00Z", items_failed: 1 },
      { job_name: "refresh_stats", started_at: "2026-07-03T02:00:00Z", items_failed: null },
    ];
    const out = summarizeRecentErrors(errors);
    expect(out.map((e) => e.jobName).sort()).toEqual(["lastfm_sync", "refresh_stats"]);
    const lastfm = out.find((e) => e.jobName === "lastfm_sync")!;
    expect(lastfm.detail).toContain("2"); // 2 error runs
  });

  it("returns nothing when there are no errors", () => {
    expect(summarizeRecentErrors([])).toEqual([]);
  });
});
