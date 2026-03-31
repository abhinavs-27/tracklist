import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getRecentAlbumsFromLogs,
  getRecentTracksFromLogs,
  type RecentAlbumItem,
  type RecentTrackRow,
} from "@/lib/recent-from-logs";
import { getValidSpotifyAccessToken } from "@/lib/spotify-user";
import { syncRecentlyPlayed } from "@/lib/spotify-sync";
import { isSpotifyIntegrationEnabled } from "@/lib/spotify-integration-enabled";

type CacheEntry<T> = { data: T; expiresAt: number };

const albumCache = new Map<string, CacheEntry<RecentAlbumItem[]>>();
const tracksCache = new Map<
  string,
  CacheEntry<{ items: RecentTrackRow[]; hasMore: boolean }>
>();

/** Recent albums from logs — low churn; 7 min. */
const ALBUM_TTL_MS = 7 * 60 * 1000;
/** Tracks + optional Spotify sync — fresher; 45 s. */
const TRACKS_TTL_MS = 45 * 1000;

function prune<T>(map: Map<string, CacheEntry<T>>) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (v.expiresAt <= now) map.delete(k);
  }
}

function albumKey(userId: string, limit: number): string {
  return `${userId}:${limit}`;
}

function tracksKey(userId: string, limit: number, offset: number): string {
  return `${userId}:${limit}:${offset}`;
}

export async function getCachedRecentAlbumsFromLogs(
  userId: string,
  limit: number,
  bust: boolean,
): Promise<RecentAlbumItem[]> {
  const key = albumKey(userId, limit);
  const now = Date.now();
  if (!bust) {
    prune(albumCache);
    const hit = albumCache.get(key);
    if (hit && hit.expiresAt > now) return hit.data;
  }

  const supabase = createSupabaseAdminClient();
  const data = await getRecentAlbumsFromLogs(supabase, userId, limit);
  albumCache.set(key, { data, expiresAt: now + ALBUM_TTL_MS });
  return data;
}

/**
 * Recent tracks from logs; optionally sync Spotify history on cache miss (offset 0 only).
 */
export async function getCachedRecentTracksFromLogs(
  userId: string,
  limit: number,
  offset: number,
  options: { bust: boolean; trySpotifySync: boolean },
): Promise<{ items: RecentTrackRow[]; hasMore: boolean }> {
  const key = tracksKey(userId, limit, offset);
  const now = Date.now();
  if (!options.bust) {
    prune(tracksCache);
    const hit = tracksCache.get(key);
    if (hit && hit.expiresAt > now) return hit.data;
  }

  const supabase = createSupabaseAdminClient();

  if (
    offset === 0 &&
    options.trySpotifySync &&
    isSpotifyIntegrationEnabled()
  ) {
    try {
      const accessToken = await getValidSpotifyAccessToken(userId);
      await syncRecentlyPlayed(userId, accessToken);
    } catch (e) {
      if (e instanceof Error && e.message === "Spotify not connected") {
        /* logs-only */
      } else {
        console.warn("[recent-activity-cache] syncRecentlyPlayed skipped", e);
      }
    }
  }

  const data = await getRecentTracksFromLogs(supabase, userId, limit, offset);
  tracksCache.set(key, { data, expiresAt: now + TRACKS_TTL_MS });
  return data;
}

/** Clear cached slices for a user (e.g. after manual sync). */
export function bustRecentActivityCacheForUser(userId: string): void {
  const prefix = `${userId}:`;
  for (const map of [albumCache, tracksCache]) {
    const toDelete = [...map.keys()].filter((k) => k.startsWith(prefix));
    for (const k of toDelete) map.delete(k);
  }
}
