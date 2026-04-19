/**
 * Lambda stubs for `next/cache` — no HTTP cache in Lambda worker.
 */

export function unstable_cache<T extends (...args: unknown[]) => unknown>(
  fn: T,
): T {
  return fn;
}

export function unstable_noStore(): void {}
