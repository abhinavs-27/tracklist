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
 * The finish() call writes one row to job_runs — it never throws (errors are caught
 * and logged), so callers should `await` it. Awaiting matters in Lambda: a fire-and-
 * forget (`void`) finish() is dropped when the runtime freezes after the handler
 * returns, which silently under-records successful long-running jobs.
 *
 * Usage:
 *   const run = await startJobRun("billboard_user", { week_start: "2025-01-06" });
 *   try {
 *     // ... do work ...
 *     await run.finish({ status: "ok", fast_path: true, items_ok: 3 });
 *   } catch (e) {
 *     await run.finish({ status: "error" });
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
