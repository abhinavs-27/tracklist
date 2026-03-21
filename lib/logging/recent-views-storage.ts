import type { RecentViewItem } from "./types";

const KEY = "tracklist:recent_views_web_v1";
const MAX = 5;

function read(): RecentViewItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentViewItem =>
        x != null &&
        typeof x === "object" &&
        typeof (x as RecentViewItem).kind === "string" &&
        typeof (x as RecentViewItem).id === "string" &&
        typeof (x as RecentViewItem).trackId === "string",
    );
  } catch {
    return [];
  }
}

function write(items: RecentViewItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getRecentViews(): RecentViewItem[] {
  return read();
}

export function recordRecentView(entry: RecentViewItem): void {
  const prev = read();
  const without = prev.filter((p) => !(p.kind === entry.kind && p.id === entry.id));
  const merged = [entry, ...without].slice(0, MAX);
  write(merged);
}
