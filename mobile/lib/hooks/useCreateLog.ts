import { fetcher } from "../api";
import {
  isLikelyNetworkError,
  loadQueue,
  replaceQueue,
  type QueuedLog,
} from "../offline-log-queue";
import type { LogRow } from "../types/log";

async function postLog(body: Record<string, unknown>): Promise<LogRow> {
  return fetcher<LogRow>("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** POST queued items from AsyncStorage (call on app active / after login). */
export async function flushPendingLogs(): Promise<{ sent: number; failed: number }> {
  const queue = await loadQueue();
  if (!queue.length) return { sent: 0, failed: 0 };

  let sent = 0;
  const remaining: QueuedLog[] = [];

  for (const item of queue) {
    try {
      await postLog(item.payload);
      sent += 1;
    } catch (e) {
      if (isLikelyNetworkError(e)) {
        remaining.push(item);
      } else {
        remaining.push(item);
      }
    }
  }

  await replaceQueue(remaining);
  return { sent, failed: remaining.length };
}
