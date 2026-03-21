"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/toast";
import { useCreateLog } from "@/lib/hooks/use-create-log";
import type { LogInput } from "@/lib/logging/types";

type LoggingContextValue = {
  quickLogOpen: boolean;
  setQuickLogOpen: (v: boolean) => void;
  logListen: (payload: LogInput & { displayName: string }) => Promise<void>;
  logBusy: boolean;
};

const LoggingContext = createContext<LoggingContextValue | null>(null);

export function LoggingProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const createLog = useCreateLog();
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  const logListen = useCallback(
    async (payload: LogInput & { displayName: string }) => {
      if (!session?.user?.id) return;
      const { displayName, ...rest } = payload;
      try {
        await createLog.mutateAsync(rest);
        toast(`Logged: ${displayName}`);
      } catch {
        toast("Couldn’t log. Try again.");
        throw new Error("log failed");
      }
    },
    [session?.user?.id, createLog, toast],
  );

  const value = useMemo(
    () =>
      ({
        quickLogOpen,
        setQuickLogOpen,
        logListen,
        logBusy: createLog.isPending,
      }) satisfies LoggingContextValue,
    [quickLogOpen, logListen, createLog.isPending],
  );

  return (
    <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>
  );
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
