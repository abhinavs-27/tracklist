import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildLogRequestBody } from "../../lib/logging/build-log-request-body";
import type { LogInput } from "./types/log";

const STORAGE_KEY = "tracklist:pending_logs_v1";

export type QueuedLog = {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function loadQueue(): Promise<QueuedLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is QueuedLog =>
        x != null &&
        typeof x === "object" &&
        typeof (x as QueuedLog).id === "string" &&
        typeof (x as QueuedLog).payload === "object" &&
        (x as QueuedLog).payload != null,
    );
  } catch {
    return [];
  }
}

async function saveQueue(items: QueuedLog[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export { buildLogRequestBody } from "../../lib/logging/build-log-request-body";

export async function enqueuePendingLog(payload: LogInput): Promise<void> {
  const queue = await loadQueue();
  queue.push({
    id: randomId(),
    payload: buildLogRequestBody(payload),
    createdAt: Date.now(),
  });
  await saveQueue(queue);
}

export async function dequeuePendingLog(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((q) => q.id !== id));
}

export async function replaceQueue(next: QueuedLog[]): Promise<void> {
  await saveQueue(next);
}

export function isLikelyNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /network request failed/i.test(msg) ||
    /failed to fetch/i.test(msg) ||
    /load failed/i.test(msg) ||
    /internet connection appears to be offline/i.test(msg)
  );
}
