/**
 * Persistent cache for mobile — AsyncStorage-backed, synchronous reads via
 * an in-memory mirror that is pre-warmed at module load time.
 *
 * Pattern:
 *   readCache(key)  → synchronous, returns whatever is in mem (null on cold start)
 *   writeCache(key) → syncs to mem immediately, flushes to AsyncStorage async
 *
 * Reads are available synchronously as TanStack Query `initialData` so the UI
 * paints stale content instantly while the network request is in-flight.
 */

import { NativeModules } from "react-native";

// Guard against missing native module (e.g. Expo Go or dev client built without
// AsyncStorage). Same pattern as supabase.ts — never call require() unless the
// native module is registered, or the v2 package throws during module init.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AsyncStorage: any;
if (NativeModules.RNCAsyncStorage) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} else {
  AsyncStorage = {
    setItem: async () => {},
    getItem: async () => null,
    removeItem: async () => {},
    multiGet: async (keys: string[]) => keys.map((k) => [k, null] as [string, null]),
  };
}

const NS = "tl:cache:v2";

// ─── Key builders ─────────────────────────────────────────────────────────────

export const CACHE_KEYS = {
  homeBundle: "home:bundle",
  homeHistoryBundle: "home:history-bundle",
  artistDetailBundle: (id: string) => `artist:detail-bundle:${id}`,
  albumSocialBundle: (id: string) => `album:social-bundle:${id}`,
  welcomeDismissed: "welcome:dismissed",
} as const;

/** Static keys pre-warmed on every app start. Dynamic keys are warmed lazily on first write. */
const STATIC_PRELOAD_KEYS: string[] = [
  CACHE_KEYS.homeBundle,
  CACHE_KEYS.homeHistoryBundle,
  CACHE_KEYS.welcomeDismissed,
];

// ─── In-memory mirror ─────────────────────────────────────────────────────────

const mem = new Map<string, unknown>();

export function readCache<T>(key: string): T | null {
  const v = mem.get(key);
  return v !== undefined ? (v as T) : null;
}

export function writeCache(key: string, value: unknown): void {
  mem.set(key, value);
  void AsyncStorage.setItem(`${NS}:${key}`, JSON.stringify(value)).catch(() => {});
}

// ─── Pre-warm — called automatically on first import ─────────────────────────

async function preload(): Promise<void> {
  try {
    const storageKeys = STATIC_PRELOAD_KEYS.map((k) => `${NS}:${k}`);
    const pairs = await AsyncStorage.multiGet(storageKeys);
    for (const [nsKey, raw] of pairs) {
      if (!raw) continue;
      const key = nsKey.slice(`${NS}:`.length);
      try {
        mem.set(key, JSON.parse(raw));
      } catch {
        // corrupt entry — ignore
      }
    }
  } catch {
    // AsyncStorage unavailable
  }
}

// Fire-and-forget: starts ~100-200ms before home screen typically mounts,
// so it usually completes before the first readCache() call.
void preload();
