/**
 * Bounded retries with exponential backoff and per-attempt timeout for external APIs.
 */

import { SpotifyRateLimitError } from "@/lib/spotify-errors";

export type WithRetryOptions = {
  maxAttempts?: number;
  /** Total wall-clock budget for a single attempt (abort signal passed to fn). */
  timeoutMs?: number;
  backoffBaseMs?: number;
  /** Log label (endpoint name). */
  label?: string;
};

function logFailure(label: string, attempt: number, max: number, detail: string) {
  const line = `[with-retry] ${label} attempt ${attempt}/${max} — ${detail}`;
  console.warn(line);
}

/**
 * Runs `fn` up to `maxAttempts` times. Each attempt is aborted after `timeoutMs`.
 * Backoff between attempts: base * 2^(attempt-1) (e.g. 500ms, 1s, 2s).
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  const backoffBaseMs = options.backoffBaseMs ?? 500;
  const label = options.label ?? "request";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fn(controller.signal);
      clearTimeout(tid);
      return result;
    } catch (e) {
      clearTimeout(tid);
      if (e instanceof SpotifyRateLimitError) throw e;
      // Circuit is open — retries would only repeat the same failure and flood logs.
      if (
        e instanceof Error &&
        e.message.includes("circuit breaker active")
      ) {
        throw e;
      }
      lastErr = e;
      const detail =
        e instanceof Error
          ? e.name === "AbortError"
            ? `timeout after ${timeoutMs}ms`
            : e.message
          : String(e);
      logFailure(label, attempt, maxAttempts, detail);
      if (attempt >= maxAttempts) break;
      await new Promise((r) =>
        setTimeout(r, backoffBaseMs * 2 ** (attempt - 1)),
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
