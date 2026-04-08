import "server-only";

import { after } from "next/server";
import { getSharedRedis } from "@/lib/redis-client";
import type { NextResponse } from "next/server";
import { apiOk } from "@/lib/api-response";

/** Throw from a stale-first `fetcher` to return a non-cacheable HTTP response (e.g. 403). */
export class StaleFirstBypassError extends Error {
  readonly response: NextResponse;

  constructor(response: NextResponse) {
    super("StaleFirstBypassError");
    this.name = "StaleFirstBypassError";
    this.response = response;
  }
}

const REDIS_KEY_PREFIX = "tracklist:swr:v1:";
const MEMORY_MAX_ENTRIES = 3000;

/** Default TTLs (seconds) — align with product expectations. */
export const STALE_FIRST_TTL_SEC = {
  feed: 90,
  explore: 180,
  /** Split Explore hub sections (independent cache keys). */
  exploreTrending: 180,
  exploreLeaderboard: 180,
  /** Static Discover CTA copy — rarely changes. */
  exploreDiscover: 3600,
  exploreReviews: 120,
  /** Dynamic discovery sections (blowing up, most talked, etc.). */
  exploreDiscoveryBundle: 180,
  /** Split Explore discovery section endpoints (same payload as bundle slices). */
  exploreDiscoverySection: 180,
  /** Personal weekly billboard / charts. */
  billboard: 3600,
  profileSummary: 60,
  communityInvite: 120,
  communityJoin: 120,
} as const;

/** Revalidate in background when cached payload is older than this (seconds). */
export const STALE_FIRST_STALE_AFTER_SEC = {
  feed: 30,
  explore: 60,
  exploreTrending: 60,
  exploreLeaderboard: 60,
  exploreDiscover: 600,
  exploreReviews: 45,
  exploreDiscoveryBundle: 60,
  exploreDiscoverySection: 60,
  billboard: 600,
  profileSummary: 20,
  communityInvite: 45,
  communityJoin: 45,
} as const;

type Stored<T> = { payload: T; fetchedAt: number };

function redisKey(logicalKey: string): string {
  return `${REDIS_KEY_PREFIX}${logicalKey}`;
}

const memoryStore = new Map<string, { payload: string; expiresAt: number }>();

type LoadResult<T extends Record<string, unknown>> =
  | { kind: "ok"; stored: Stored<T> }
  | { kind: "notfound" };

const loadInFlight = new Map<string, Promise<LoadResult<Record<string, unknown>>>>();
const bgRefreshInFlight = new Set<string>();

async function readMemory<T>(logicalKey: string): Promise<Stored<T> | undefined> {
  const row = memoryStore.get(logicalKey);
  if (!row) return undefined;
  if (Date.now() >= row.expiresAt) {
    memoryStore.delete(logicalKey);
    return undefined;
  }
  try {
    return JSON.parse(row.payload) as Stored<T>;
  } catch {
    memoryStore.delete(logicalKey);
    return undefined;
  }
}

async function readRedis<T>(logicalKey: string): Promise<Stored<T> | undefined> {
  const r = getSharedRedis();
  if (!r) return undefined;
  try {
    const raw = await r.get(redisKey(logicalKey));
    if (!raw) return undefined;
    return JSON.parse(raw) as Stored<T>;
  } catch {
    return undefined;
  }
}

function writeMemory(logicalKey: string, value: Stored<unknown>, ttlSec: number): void {
  if (memoryStore.size >= MEMORY_MAX_ENTRIES) {
    const first = memoryStore.keys().next().value;
    if (first) memoryStore.delete(first);
  }
  memoryStore.set(logicalKey, {
    payload: JSON.stringify(value),
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

async function writeRedis(
  logicalKey: string,
  value: Stored<unknown>,
  ttlSec: number,
): Promise<void> {
  const r = getSharedRedis();
  if (!r) return;
  try {
    const ex = Math.max(60, ttlSec);
    await r.set(redisKey(logicalKey), JSON.stringify(value), "EX", ex);
  } catch {
    /* ignore */
  }
}

async function readStored<T>(logicalKey: string): Promise<Stored<T> | undefined> {
  const fromRedis = await readRedis<T>(logicalKey);
  if (fromRedis !== undefined) return fromRedis;
  return readMemory<T>(logicalKey);
}

async function writeStored<T>(
  logicalKey: string,
  stored: Stored<T>,
  ttlSec: number,
): Promise<void> {
  await writeRedis(logicalKey, stored, ttlSec);
  writeMemory(logicalKey, stored, ttlSec);
}

function mergeFetched<T extends Record<string, unknown>>(
  payload: T,
  fetchedAt: number,
): T & { fetched_at: string } {
  return {
    ...payload,
    fetched_at: new Date(fetchedAt).toISOString(),
  };
}

function scheduleBackgroundRefresh<T extends Record<string, unknown>>(
  logicalKey: string,
  ttlSec: number,
  fetcher: () => Promise<T | null>,
  cacheWhen: (value: T) => boolean,
): void {
  if (bgRefreshInFlight.has(logicalKey)) return;
  bgRefreshInFlight.add(logicalKey);

  const run = async () => {
    try {
      const value = await fetcher();
      if (value == null || !cacheWhen(value)) return;
      const stored: Stored<T> = { payload: value, fetchedAt: Date.now() };
      await writeStored(logicalKey, stored, ttlSec);
    } catch (e) {
      if (e instanceof StaleFirstBypassError) return;
      console.warn("[stale-first] background refresh failed", logicalKey, e);
    } finally {
      bgRefreshInFlight.delete(logicalKey);
    }
  };

  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}

export type StaleFirstApiOkOptions<T extends Record<string, unknown>> = {
  /** Skip reading cache; still writes after successful fetch. */
  bypassCache?: boolean;
  cacheWhen?: (value: T) => boolean;
  /** When fetcher returns null (cache miss path). */
  notFoundResponse?: () => NextResponse;
};

export type StaleFirstHitMeta = {
  /** Matches `X-Tracklist-Stale-First` on the HTTP route. */
  staleFirst: "hit" | "miss" | "miss-inflight" | "bypass";
};

/**
 * Same cache keying and TTL as {@link staleFirstApiOk}, for RSC and server code that
 * need the payload without wrapping in `NextResponse`. Adds `fetched_at` (ISO).
 */
export async function staleFirstGetValue<T extends Record<string, unknown>>(
  logicalKey: string,
  ttlSec: number,
  staleAfterSec: number,
  fetcher: () => Promise<T | null>,
  options?: StaleFirstApiOkOptions<T>,
): Promise<(T & { fetched_at: string }) & StaleFirstHitMeta> {
  const cacheWhen = options?.cacheWhen ?? ((): boolean => true);
  const bypass = options?.bypassCache === true;

  if (!bypass) {
    const cached = await readStored<T>(logicalKey);
    if (cached !== undefined) {
      const ageMs = Date.now() - cached.fetchedAt;
      if (ageMs > staleAfterSec * 1000) {
        scheduleBackgroundRefresh(logicalKey, ttlSec, fetcher, cacheWhen);
      }
      return {
        ...mergeFetched(cached.payload, cached.fetchedAt),
        staleFirst: "hit",
      };
    }
  }

  const existing = loadInFlight.get(logicalKey);
  if (existing) {
    try {
      const shared = (await existing) as LoadResult<T>;
      if (shared.kind === "notfound") {
        const nf = options?.notFoundResponse;
        if (nf) throw new StaleFirstBypassError(nf());
        throw new Error(
          "[stale-first] notFoundResponse required when fetcher returns null",
        );
      }
      return {
        ...mergeFetched(shared.stored.payload, shared.stored.fetchedAt),
        staleFirst: "miss-inflight",
      };
    } catch (e) {
      if (e instanceof StaleFirstBypassError) {
        throw e;
      }
      throw e;
    }
  }

  const promise = (async (): Promise<LoadResult<T>> => {
    const value = await fetcher();
    if (value == null) {
      return { kind: "notfound" };
    }
    const shouldCache = cacheWhen(value);
    const stored: Stored<T> = { payload: value, fetchedAt: Date.now() };
    if (shouldCache) {
      await writeStored(logicalKey, stored, ttlSec);
    }
    return { kind: "ok", stored };
  })();

  loadInFlight.set(logicalKey, promise as Promise<LoadResult<Record<string, unknown>>>);
  let result: LoadResult<T>;
  try {
    result = await promise;
  } catch (e) {
    if (e instanceof StaleFirstBypassError) {
      throw e;
    }
    throw e;
  } finally {
    loadInFlight.delete(logicalKey);
  }

  if (result.kind === "notfound") {
    const nf = options?.notFoundResponse;
    if (nf) throw new StaleFirstBypassError(nf());
    throw new Error(
      "[stale-first] notFoundResponse required when fetcher returns null",
    );
  }

  return {
    ...mergeFetched(result.stored.payload, result.stored.fetchedAt),
    staleFirst: bypass ? "bypass" : "miss",
  };
}

/**
 * Stale-first JSON responses: return cached payload immediately when present,
 * optionally refresh in the background after `staleAfterSec`.
 * Adds `fetched_at` (ISO) to the response body.
 */
export async function staleFirstApiOk<T extends Record<string, unknown>>(
  logicalKey: string,
  ttlSec: number,
  staleAfterSec: number,
  fetcher: () => Promise<T | null>,
  options?: StaleFirstApiOkOptions<T>,
): Promise<NextResponse> {
  try {
    const merged = await staleFirstGetValue(
      logicalKey,
      ttlSec,
      staleAfterSec,
      fetcher,
      options,
    );
    const { staleFirst, fetched_at, ...payload } = merged;
    const res = apiOk({ ...payload, fetched_at });
    res.headers.set("Cache-Control", "private, no-store, must-revalidate");
    res.headers.set("X-Tracklist-Stale-First", staleFirst);
    return res;
  } catch (e) {
    if (e instanceof StaleFirstBypassError) {
      return e.response;
    }
    throw e;
  }
}
