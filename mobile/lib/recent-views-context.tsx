import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const KEY = "tracklist:recent_views_v1";
const MAX = 5;

export type RecentViewItem = {
  kind: "album" | "song" | "artist";
  id: string;
  title: string;
  subtitle: string;
  artworkUrl: string | null;
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
  viewedAt: number;
};

async function readStorage(): Promise<RecentViewItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentViewItem =>
        x != null &&
        typeof x === "object" &&
        (x as RecentViewItem).kind &&
        typeof (x as RecentViewItem).id === "string" &&
        typeof (x as RecentViewItem).trackId === "string",
    );
  } catch {
    return [];
  }
}

async function writeStorage(items: RecentViewItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

type RecentViewsContextValue = {
  items: RecentViewItem[];
  recordView: (next: Omit<RecentViewItem, "viewedAt">) => Promise<void>;
};

const RecentViewsContext = createContext<RecentViewsContextValue | null>(null);

export function RecentViewsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<RecentViewItem[]>([]);

  useEffect(() => {
    void readStorage().then(setItems);
  }, []);

  const recordView = useCallback(async (next: Omit<RecentViewItem, "viewedAt">) => {
    const entry: RecentViewItem = { ...next, viewedAt: Date.now() };
    const prev = await readStorage();
    const without = prev.filter((p) => !(p.kind === entry.kind && p.id === entry.id));
    const merged = [entry, ...without].slice(0, MAX);
    await writeStorage(merged);
    setItems(merged);
  }, []);

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
