import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fetchUserMap,
  getActivityFeed,
  type ActivityFeedPage,
} from "@/lib/queries";
import type { FeedActivity, FeedStoryActivity, FeedStoryKind } from "@/types";

/** Insight cards per page cap (chronological merge with legacy). */
function maxStorySlotsForLimit(capped: number): number {
  return Math.min(6, Math.max(2, Math.floor(capped * 0.12)));
}

/** Newest first; on identical timestamps prefer listens/reviews/follows over insight cards. */
function mergeChronological(
  legacyItems: FeedActivity[],
  stories: FeedStoryActivity[],
  cap: number,
  maxStories: number,
): FeedActivity[] {
  const storySlice = stories.slice(0, maxStories);
  const combined: FeedActivity[] = [...legacyItems, ...storySlice];
  combined.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (tb !== ta) return tb - ta;
    const rank = (x: FeedActivity) => (x.type === "feed_story" ? 1 : 0);
    return rank(a) - rank(b);
  });
  return combined.slice(0, cap);
}

async function loadFollowingIds(
  admin: SupabaseClient,
  followerId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("follows")
    // Optimization: exclude follower_id as it is in the .eq filter
    .select("following_id")
    .eq("follower_id", followerId)
    .limit(500);
  return (data ?? [])
    .map((r) => (r as { following_id: string }).following_id)
    .filter(Boolean);
}

/**
 * Fill display names from local cache tables only (no Spotify round-trips on read).
 */
async function enrichPayloadsFromDb(
  admin: SupabaseClient,
  rows: FeedEventRow[],
): Promise<Map<string, Record<string, unknown>>> {
  const artistIds = new Set<string>();
  const albumIds = new Set<string>();
  const trackIds = new Set<string>();

  for (const row of rows) {
    const kind = row.type as string;
    const p = (row.payload ?? {}) as Record<string, unknown>;
    if (kind === "discovery" || kind === "top-artist-shift") {
      const aid = p.artist_id as string | undefined;
      if (aid && !p.artist_name) artistIds.add(aid);
    }
    if (kind === "rating") {
      const et = p.entity_type as string | undefined;
      const eid = p.entity_id as string | undefined;
      if (eid && !p.title) {
        if (et === "album") albumIds.add(eid);
        else if (et === "song") trackIds.add(eid);
      }
    }
  }

  const [aRes, albRes, songRes] = await Promise.all([
    artistIds.size > 0
      ? admin.from("artists").select("id, name").in("id", [...artistIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    albumIds.size > 0
      ? admin.from("albums").select("id, name").in("id", [...albumIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    trackIds.size > 0
      ? admin.from("tracks").select("id, name").in("id", [...trackIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const artistName = new Map(
    (aRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );
  const albumName = new Map(
    (albRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );
  const trackName = new Map(
    (songRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  const out = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const p = { ...(row.payload ?? {}) } as Record<string, unknown>;
    const kind = row.type as string;
    if (kind === "discovery" || kind === "top-artist-shift") {
      const aid = p.artist_id as string | undefined;
      if (aid && !p.artist_name) {
        const n = artistName.get(aid);
        if (n) p.artist_name = n;
      }
    }
    if (kind === "rating") {
      const et = p.entity_type as string | undefined;
      const eid = p.entity_id as string | undefined;
      if (eid && !p.title) {
        if (et === "album") {
          const n = albumName.get(eid);
          if (n) p.title = n;
        } else if (et === "song") {
          const n = trackName.get(eid);
          if (n) p.title = n;
        }
      }
    }
    out.set(row.id, p);
  }
  return out;
}

type FeedEventRow = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * Fetch feed_events for followed users. Names come from DB cache only — fast.
 * Feed event materialization runs via cron / review hook, not on every feed read.
 */
async function fetchFeedStoriesForFollower(
  followerId: string,
  limit: number,
  cursor: string | null,
  followingIds?: string[],
): Promise<FeedStoryActivity[]> {
  const admin = createSupabaseAdminClient();
  const ids =
    followingIds ?? (await loadFollowingIds(admin, followerId));
  if (ids.length === 0) return [];

  let q = admin
    .from("feed_events")
    .select("id, user_id, type, payload, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit + 20, 120));

  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[merged-feed] feed_events query failed", error.message);
    return [];
  }

  const rows = (data ?? []) as FeedEventRow[];
  const filtered = rows.filter((r) => isFeedStoryKind(r.type));
  if (filtered.length === 0) return [];

  const payloadMap = await enrichPayloadsFromDb(admin, filtered);

  const userIds = [...new Set(filtered.map((r) => r.user_id))];
  const userMap = await fetchUserMap(admin, userIds);

  return filtered.map((row) => ({
    type: "feed_story" as const,
    story_kind: row.type as FeedStoryKind,
    id: row.id,
    created_at: row.created_at,
    user: userMap.get(row.user_id) ?? null,
    payload: payloadMap.get(row.id) ?? row.payload ?? {},
  }));
}

function isFeedStoryKind(s: string): s is FeedStoryKind {
  return (
    s === "discovery" ||
    s === "top-artist-shift" ||
    s === "rating" ||
    s === "streak" ||
    s === "binge" ||
    s === "new-list" ||
    s === "milestone"
  );
}

/**
 * Merges feed v2 stories with legacy activity (reviews, follows, listens).
 * Does not run heavy sync work on read — use cron `feed-events-sync` instead.
 */
export async function getMergedActivityFeed(
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  const capped = Math.min(Math.max(1, limit), 100);

  const admin = createSupabaseAdminClient();
  const followingIds = await loadFollowingIds(admin, userId);

  const maxStories = maxStorySlotsForLimit(capped);
  const [stories, legacyPage] = await Promise.all([
    fetchFeedStoriesForFollower(userId, 24, cursor, followingIds),
    getActivityFeed(userId, capped + 30, cursor),
  ]);

  const items = mergeChronological(
    legacyPage.items,
    stories,
    capped,
    maxStories,
  );
  const next_cursor =
    items.length === capped ? items[items.length - 1]?.created_at ?? null : null;

  return { items, next_cursor };
}
