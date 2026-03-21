import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { flushPendingLogs, useCreateLog } from "./hooks/useCreateLog";
import { queryKeys } from "./query-keys";
import type { LogInput } from "./types/log";

type LoggingContextValue = {
  quickLogOpen: boolean;
  setQuickLogOpen: (v: boolean) => void;
  toastMessage: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
  logListen: (payload: LogInput & { displayName: string }) => Promise<void>;
  logBusy: boolean;
  flushOfflineQueue: () => Promise<void>;
};

const LoggingContext = createContext<LoggingContextValue | null>(null);

const TOAST_MS = 3200;

export function LoggingProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const createLog = useCreateLog();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToastMessage(null);
  }, []);

  const showToast = useCallback(
    (message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToastMessage(message);
      toastTimer.current = setTimeout(() => {
        setToastMessage(null);
        toastTimer.current = null;
      }, TOAST_MS);
    },
    [],
  );

  const flushOfflineQueue = useCallback(async () => {
    const { sent } = await flushPendingLogs();
    if (sent > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed() });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
    }
  }, [queryClient]);

  useEffect(() => {
    void flushOfflineQueue();
  }, [flushOfflineQueue]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void flushOfflineQueue();
    });
    return () => sub.remove();
  }, [flushOfflineQueue]);

  const logListen = useCallback(
    async (payload: LogInput & { displayName: string }) => {
      const { displayName, ...rest } = payload;
      const res = await createLog.mutateAsync(rest);
      if (res.status === "queued") {
        showToast(`Queued (offline): ${displayName}`);
      } else {
        showToast(`Logged: ${displayName}`);
      }
    },
    [createLog, showToast],
  );

  const value = useMemo(
    () =>
      ({
        quickLogOpen,
        setQuickLogOpen,
        toastMessage,
        showToast,
        dismissToast,
        logListen,
        logBusy: createLog.isPending,
        flushOfflineQueue,
      }) satisfies LoggingContextValue,
    [
      quickLogOpen,
      toastMessage,
      showToast,
      dismissToast,
      logListen,
      createLog.isPending,
      flushOfflineQueue,
    ],
  );

  return <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>;
}

export function useLogging(): LoggingContextValue {
  const ctx = useContext(LoggingContext);
  if (!ctx) {
    throw new Error("useLogging must be used within LoggingProvider");
  }
  return ctx;
}

export function useOptionalLogging(): LoggingContextValue | null {
  return useContext(LoggingContext);
}
