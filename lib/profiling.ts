/**
 * Profiling and timing for bottlenecks. Use PROFILING=1 to enable console logs,
 * PROFILING_JSON=1 for one-line JSON (APM-friendly).
 *
 * Optional APM integration: pipe console output to your APM (e.g. Datadog log intake,
 * Sentry breadcrumbs, New Relic custom events) or call logPerf() from a custom
 * transport that sends to your APM's SDK (e.g. Sentry.addBreadcrumb, dd-trace).
 */

const PREFIX = "[perf]";
const ENABLED = process.env.PROFILING === "1" || process.env.PROFILING_JSON === "1";
const JSON_MODE = process.env.PROFILING_JSON === "1";

export type PerfCategory = "spotify" | "db" | "cache" | "cache_miss" | "mv_hit" | "mv_miss" | "page" | "enrich";

interface PerfEntry {
  category: PerfCategory;
  label: string;
  ms: number;
  meta?: Record<string, string | number | boolean | null>;
  at: number;
}

const recentEntries: PerfEntry[] = [];
const MAX_RECENT = 200;

function logPerfInternal(category: PerfCategory, label: string, ms: number, meta?: Record<string, string | number | boolean | null>) {
  const entry: PerfEntry = { category, label, ms, meta, at: Date.now() };
  recentEntries.push(entry);
  if (recentEntries.length > MAX_RECENT) recentEntries.shift();

  if (!ENABLED) return;

  if (JSON_MODE) {
    console.log(
      JSON.stringify({
        perf: 1,
        category,
        label,
        ms: Math.round(ms * 100) / 100,
        ...meta,
      }),
    );
    return;
  }

  const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${PREFIX} ${category} ${label} ms=${Math.round(ms * 100) / 100}${metaStr}`);
}

/** Log a timing (call when you already have duration in ms). */
export function logPerf(
  category: PerfCategory,
  label: string,
  ms: number,
  meta?: Record<string, string | number | boolean | null>,
) {
  logPerfInternal(category, label, ms, meta);
}

/** Time an async function and log duration. Returns the result. */
export async function timeAsync<T>(
  category: PerfCategory,
  label: string,
  fn: () => Promise<T>,
  meta?: Record<string, string | number | boolean | null>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const ms = performance.now() - start;
    logPerfInternal(category, label, ms, meta);
    return result;
  } catch (e) {
    const ms = performance.now() - start;
    logPerfInternal(category, label, ms, { ...meta, error: 1 });
    throw e;
  }
}

/** Time a sync function and log duration. */
export function timeSync<T>(
  category: PerfCategory,
  label: string,
  fn: () => T,
  meta?: Record<string, string | number | boolean | null>,
): T {
  const start = performance.now();
  try {
    const result = fn();
    const ms = performance.now() - start;
    logPerfInternal(category, label, ms, meta);
    return result;
  } catch (e) {
    const ms = performance.now() - start;
    logPerfInternal(category, label, ms, { ...meta, error: 1 });
    throw e;
  }
}

/** Return the top N slowest operations from recent logs (for debugging / tests). */
export function getTopSlowest(n = 10): { label: string; category: PerfCategory; ms: number }[] {
  return [...recentEntries]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n)
    .map((e) => ({ label: e.label, category: e.category, ms: e.ms }));
}

/** Clear recent entries (e.g. before a test run). */
export function clearPerfEntries(): void {
  recentEntries.length = 0;
}
