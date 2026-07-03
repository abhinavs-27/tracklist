import { startJobRun } from "./job-logger";
import { sendJobAlert } from "./alert";

/**
 * Wraps a cron/background job body: records one `job_runs` row and, on failure, fires an
 * alert before rethrowing. If the job result exposes numeric `items_ok` / `items_failed`,
 * those are recorded too. Observability writes never affect job correctness.
 */
export async function withJobRun<T>(
  jobName: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const run = await startJobRun(jobName, meta);
  try {
    const result = await fn();
    const r = result as { items_ok?: number; items_failed?: number } | null;
    void run.finish({
      status: "ok",
      items_ok: typeof r?.items_ok === "number" ? r.items_ok : undefined,
      items_failed: typeof r?.items_failed === "number" ? r.items_failed : undefined,
    });
    return result;
  } catch (e) {
    const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    void run.finish({ status: "error" });
    void sendJobAlert({ jobName, kind: "error", detail });
    throw e;
  }
}
