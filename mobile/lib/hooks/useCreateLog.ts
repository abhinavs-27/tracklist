import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import {
  buildLogRequestBody,
  enqueuePendingLog,
  isLikelyNetworkError,
  loadQueue,
  replaceQueue,
  type QueuedLog,
} from "../offline-log-queue";
import type { LogInput, LogRow } from "../types/log";

async function postLog(body: Record<string, unknown>): Promise<LogRow> {
  return fetcher<LogRow>("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type CreateLogResult = { status: "synced"; data: LogRow } | { status: "queued" };

export function useCreateLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: LogInput): Promise<CreateLogResult> => {
      const body = buildLogRequestBody(payload);
      try {
        const data = await postLog(body);
        return { status: "synced", data };
      } catch (e) {
        if (isLikelyNetworkError(e)) {
          await enqueuePendingLog(payload);
          return { status: "queued" };
        }
        throw e;
      }
    },
    onSuccess: (result, variables) => {
      if (result.status !== "synced") return;
      queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
      if (variables.trackId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.song(variables.trackId) });
      }
      if (variables.albumId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.album(variables.albumId) });
      }
      if (variables.artistId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.artist(variables.artistId) });
      }
    },
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
