"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { RecentViewItem } from "@/lib/logging/types";
import {
  getRecentViews,
  recordRecentView as persistRecentView,
} from "@/lib/logging/recent-views-storage";

type RecentViewsContextValue = {
  items: RecentViewItem[];
  recordView: (next: RecentViewItem) => void;
};

const RecentViewsContext = createContext<RecentViewsContextValue | null>(null);

export function RecentViewsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [items, setItems] = useState<RecentViewItem[]>([]);

  useEffect(() => {
    setItems(getRecentViews());
  }, []);

  const recordView = useCallback(
    (next: RecentViewItem) => {
      if (!session?.user?.id) return;
      persistRecentView(next);
      setItems(getRecentViews());
    },
    [session?.user?.id],
  );

  const value = useMemo(
    () => ({ items, recordView }),
    [items, recordView],
  );

  return (
    <RecentViewsContext.Provider value={value}>
      {children}
    </RecentViewsContext.Provider>
  );
}

export function useRecentViews(): RecentViewsContextValue {
  const ctx = useContext(RecentViewsContext);
  if (!ctx) {
    throw new Error("useRecentViews must be used within RecentViewsProvider");
  }
  return ctx;
}
