import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { flushPendingLogs } from "../lib/hooks/useCreateLog";
import { queryKeys } from "../lib/query-keys";

/**
 * Drains any legacy offline log queue (AsyncStorage) on launch / resume.
 * Manual logging UI was removed; this only flushes old queued POSTs if present.
 */
export function OfflineLogFlush() {
  const queryClient = useQueryClient();

  const run = useCallback(async () => {
    const { sent } = await flushPendingLogs();
    if (sent > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
    }
  }, [queryClient]);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void run();
    });
    return () => sub.remove();
  }, [run]);

  return null;
}
