import "server-only";

import { after } from "next/server";
import {
  firstSpotifyImageUrl,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { normalizeReviewEntityId } from "@/lib/validation";

const LOG_PREFIX = "[explore-enrich]";

/** Max Spotify batch per background run (safeguard). */
export const EXPLORE_ENRICH_MAX_BATCH = 20;

/** Fail fast if Spotify + upserts exceed this. */
const ENRICH_SPOTIFY_TIMEOUT_MS = 10_000;

/** Skip re-enqueueing the same track within this window (dedupe across requests). */
const ENRICH_DEDUPE_TTL_MS = 90_000;

const recentEnqueueAt = new Map<string, number>();
const inFlight = new Set<string>();

function pruneRecentEnqueue(now: number): void {
  if (recentEnqueueAt.size < 500) return;
  const cutoff = now - ENRICH_DEDUPE_TTL_MS;
  for (const [id, t] of recentEnqueueAt) {
    if (t < cutoff) recentEnqueueAt.delete(id);
  }
}

function isRecentlyEnqueued(id: string, now: number): boolean {
  const t = recentEnqueueAt.get(id);
  return t != null && now - t < ENRICH_DEDUPE_TTL_MS;
}

export function isExploreTrackMetadataIncomplete(
  t: SpotifyApi.TrackObjectFull | null,
): boolean {
  if (!t) return true;
  const title = (t.name ?? "").trim();
  const artist = (t.artists?.[0]?.name ?? "").trim();
  const img = firstSpotifyImageUrl(t.album?.images);
  if (!title || !artist) return true;
  if (!img) return true;
  if (title === "Track" && artist === "Artist") return true;
  return false;
}

/**
 * Canonical track ids (entity_id from trending) that still need Spotify/DB hydration.
 */
export function collectTrackIdsNeedingEnrichment(
  entityIds: string[],
  tracksMap: Map<string, SpotifyApi.TrackObjectFull | null>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const eid of entityIds) {
    const key = normalizeReviewEntityId(eid);
    if (seen.has(key)) continue;
    seen.add(key);
    const tr = tracksMap.get(key) ?? null;
    if (isExploreTrackMetadataIncomplete(tr)) {
      out.push(normalizeReviewEntityId(eid));
    }
  }
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${LOG_PREFIX} timeout after ${ms}ms`));
      }, ms);
    }),
  ]);
}

async function runExploreTrackEnrichment(trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) return;
  try {
    await withTimeout(
      getOrFetchTracksBatch(trackIds, {
        allowNetwork: true,
        allowLastfmMapping: true,
      }),
      ENRICH_SPOTIFY_TIMEOUT_MS,
    );
  } catch (e) {
    console.warn(LOG_PREFIX, "background enrichment failed", e);
  } finally {
    for (const id of trackIds) {
      inFlight.delete(id);
    }
  }
}

/**
 * Schedules Spotify/catalog hydration after the response is sent. Does not block the request.
 * Deduplicates by track id (in-flight + TTL) and caps batch size.
 */
export function scheduleExploreTrackEnrichment(rawIds: string[]): void {
  const now = Date.now();
  pruneRecentEnqueue(now);

  const unique = [...new Set(rawIds.map((id) => normalizeReviewEntityId(id)))].filter(
    Boolean,
  );
  const selected: string[] = [];
  for (const id of unique) {
    if (selected.length >= EXPLORE_ENRICH_MAX_BATCH) break;
    if (inFlight.has(id)) continue;
    if (isRecentlyEnqueued(id, now)) continue;
    inFlight.add(id);
    recentEnqueueAt.set(id, now);
    selected.push(id);
  }

  if (selected.length === 0) return;

  try {
    after(() => {
      void runExploreTrackEnrichment(selected);
    });
  } catch {
    void runExploreTrackEnrichment(selected);
  }
}
