/**
 * Timing logs for `/explore` (RSC) and `GET /api/explore`.
 * Enable with `EXPLORE_PERF=1` or `PROFILING=1`, or in development (`NODE_ENV !== "production"`).
 */
export function explorePerfEnabled(): boolean {
  return (
    process.env.EXPLORE_PERF === "1" ||
    process.env.PROFILING === "1" ||
    process.env.NODE_ENV !== "production"
  );
}

export function exploreLog(label: string, ms: number): void {
  if (!explorePerfEnabled()) return;
  console.log(`explore: ${label}: ${ms}ms`);
}

export function exploreLogLine(message: string): void {
  if (!explorePerfEnabled()) return;
  console.log(message);
}
