/**
 * Timing logs for `/discover` (RSC).
 * Enable with `DISCOVER_PERF=1` or `PROFILING=1`, or in development (`NODE_ENV !== "production"`).
 */
export function discoverPerfEnabled(): boolean {
  return (
    process.env.DISCOVER_PERF === "1" ||
    process.env.PROFILING === "1" ||
    process.env.NODE_ENV !== "production"
  );
}

export function discoverLog(label: string, ms: number): void {
  if (!discoverPerfEnabled()) return;
  console.log(`discover: ${label}: ${ms}ms`);
}

export function discoverLogLine(message: string): void {
  if (!discoverPerfEnabled()) return;
  console.log(message);
}
