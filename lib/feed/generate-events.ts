import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FeedStoryKind } from "@/types";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BINGE_WINDOW_MS = 2 * 60 * 60 * 1000;
const BINGE_MIN_LOGS = 14;
const TOP_N = 5;
const MAX_SYNC_INSERTS = 12;
const MAX_PER_DAY_FROM_SYNC = 8;

type LogRow = {
  listened_at: string;
  artist_id: string | null;
  track_id: string | null;
};

type SongRow = { id: string; artist_id: string };

async function fetchSongsArtist(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, SongRow>> {
  const out = new Map<string, SongRow>();
  const unique = [...new Set(trackIds)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tracks")
      .select("id, artist_id")
      .in("id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const r = row as SongRow;
      out.set(r.id, r);
    }
  }
  return out;
}

function resolveArtistId(log: LogRow, songMap: Map<string, SongRow>): string | null {
  const a = log.artist_id?.trim();
  if (a) return a;
  const tid = log.track_id?.trim();
  if (!tid) return null;
  return songMap.get(tid)?.artist_id ?? null;
}

async function countEventsSince(
  admin: SupabaseClient,
  userId: string,
  since: string,
): Promise<number> {
  const { count, error } = await admin
    .from("feed_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

async function existsDedupe(
  admin: SupabaseClient,
  userId: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("feed_events")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) return true;
  return !!data;
}

async function insertFeedEvent(
  admin: SupabaseClient,
  args: {
    userId: string;
    kind: FeedStoryKind;
    payload: Record<string, unknown>;
    dedupeKey: string;
    createdAt?: string;
  },
): Promise<boolean> {
  if (await existsDedupe(admin, args.userId, args.dedupeKey)) return false;
  const { error } = await admin.from("feed_events").insert({
    user_id: args.userId,
    type: args.kind,
    payload: args.payload,
    dedupe_key: args.dedupeKey,
    created_at: args.createdAt ?? new Date().toISOString(),
  });
  if (error) {
    console.warn("[feed-events] insert failed", args.dedupeKey, error.message);
    return false;
  }
  return true;
}

/**
 * Incremental sync: derive discovery, binge, top-artist shift, streak, list, milestone
 * from recent logs and profile data. Idempotent via dedupe_key.
 */
export async function syncFeedEventsForUser(userId: string): Promise<void> {
  const uid = userId?.trim();
  if (!uid) return;

  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const since = new Date(now - WINDOW_MS).toISOString();
  const prevSince = new Date(now - 2 * WINDOW_MS).toISOString();

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayCount = await countEventsSince(admin, uid, dayStart.toISOString());
  if (dayCount >= MAX_PER_DAY_FROM_SYNC) return;

  let inserted = 0;

  const { data: weekLogs, error: wErr } = await admin
    .from("logs")
    .select("listened_at, artist_id, track_id")
    .eq("user_id", uid)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(8000);

  if (wErr || !weekLogs?.length) {
    if (wErr) console.warn("[feed-events] week logs", wErr.message);
  } else {
    const logs = weekLogs as LogRow[];
    const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
    const songMap = await fetchSongsArtist(admin, trackIds);

    const artistPlays = new Map<string, number>();
    const times: number[] = [];
    for (const log of logs) {
      const aid = resolveArtistId(log, songMap);
      if (aid) artistPlays.set(aid, (artistPlays.get(aid) ?? 0) + 1);
      const t = new Date(log.listened_at).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }

    const { data: priorLogRows } = await admin
      .from("logs")
      .select("artist_id, track_id")
      .eq("user_id", uid)
      .lt("listened_at", since)
      .limit(5000);
    const priorArtists = new Set<string>();
    const pRows = (priorLogRows ?? []) as Pick<LogRow, "artist_id" | "track_id">[];
    const pTids = [...new Set(pRows.map((r) => r.track_id).filter(Boolean))] as string[];
    const priorSongMap = await fetchSongsArtist(admin, pTids);
    for (const row of pRows) {
      const aid = resolveArtistId(row as LogRow, priorSongMap);
      if (aid) priorArtists.add(aid);
    }

    const weekArtists = [...artistPlays.keys()];
    for (const artistId of weekArtists) {
      if (inserted >= MAX_SYNC_INSERTS) break;
      if (priorArtists.has(artistId)) continue;

      const firstListen = logs.find((l) => resolveArtistId(l, songMap) === artistId);
      const createdAt = firstListen?.listened_at ?? since;
      const ok = await insertFeedEvent(admin, {
        userId: uid,
        kind: "discovery",
        payload: { artist_id: artistId },
        dedupeKey: `discovery|${artistId}|${since.slice(0, 10)}`,
        createdAt,
      });
      if (ok) inserted++;
    }

    // Binge: max logs in 2h window
    if (inserted < MAX_SYNC_INSERTS && times.length >= BINGE_MIN_LOGS) {
      times.sort((a, b) => a - b);
      let maxInWindow = 0;
      let windowEnd = 0;
      let j = 0;
      for (let i = 0; i < times.length; i++) {
        while (times[j] < times[i] - BINGE_WINDOW_MS) j++;
        const c = i - j + 1;
        if (c > maxInWindow) {
          maxInWindow = c;
          windowEnd = times[i];
        }
      }
      if (maxInWindow >= BINGE_MIN_LOGS) {
        const ok = await insertFeedEvent(admin, {
          userId: uid,
          kind: "binge",
          payload: { log_count: maxInWindow, window_ms: BINGE_WINDOW_MS },
          dedupeKey: `binge|${new Date(windowEnd).toISOString().slice(0, 10)}`,
          createdAt: new Date(windowEnd).toISOString(),
        });
        if (ok) inserted++;
      }
    }

    // Top artist shift vs previous 7d (#1 artist changed, strong week)
    if (inserted < MAX_SYNC_INSERTS) {
      const { data: prevLogs } = await admin
        .from("logs")
        .select("artist_id, track_id")
        .eq("user_id", uid)
        .gte("listened_at", prevSince)
        .lt("listened_at", since)
        .limit(5000);
      const prevRows = (prevLogs ?? []) as Pick<LogRow, "artist_id" | "track_id">[];
      const ptids2 = [...new Set(prevRows.map((r) => r.track_id).filter(Boolean))] as string[];
      const psm2 = await fetchSongsArtist(admin, ptids2);
      const prevCounts = new Map<string, number>();
      for (const row of prevRows) {
        const aid = resolveArtistId(row as LogRow, psm2);
        if (aid) prevCounts.set(aid, (prevCounts.get(aid) ?? 0) + 1);
      }
      const sortedWeek = [...artistPlays.entries()].sort((a, b) => b[1] - a[1]);
      const sortedPrev = [...prevCounts.entries()].sort((a, b) => b[1] - a[1]);
      const topWeek = sortedWeek[0];
      const topPrev = sortedPrev[0];
      if (
        topWeek &&
        topWeek[1] >= 5 &&
        topWeek[0] &&
        (!topPrev || topWeek[0] !== topPrev[0])
      ) {
        const prevTopN = new Set(sortedPrev.slice(0, TOP_N).map((x) => x[0]));
        if (!prevTopN.has(topWeek[0])) {
          const ok = await insertFeedEvent(admin, {
            userId: uid,
            kind: "top-artist-shift",
            payload: { artist_id: topWeek[0], play_count: topWeek[1] },
            dedupeKey: `shift|${topWeek[0]}|${since.slice(0, 10)}`,
            createdAt: since,
          });
          if (ok) inserted++;
        }
      }
    }
  }

  // Ratings from reviews (backfill window)
  if (inserted < MAX_SYNC_INSERTS) {
    const { data: revRows } = await admin
      .from("reviews")
      .select("id, entity_type, entity_id, rating, created_at")
      .eq("user_id", uid)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const r of revRows ?? []) {
      if (inserted >= MAX_SYNC_INSERTS) break;
      const row = r as {
        id: string;
        entity_type: string;
        entity_id: string;
        rating: number;
        created_at: string;
      };
      const ok = await insertFeedEvent(admin, {
        userId: uid,
        kind: "rating",
        payload: {
          review_id: row.id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          rating: row.rating,
        },
        dedupeKey: `rating|${row.id}`,
        createdAt: row.created_at,
      });
      if (ok) inserted++;
    }
  }

  // Streak milestone (>= 3 days)
  if (inserted < MAX_SYNC_INSERTS) {
    const { data: streak } = await admin
      .from("user_streaks")
      .select("current_streak, updated_at")
      .eq("user_id", uid)
      .maybeSingle();
    const cur = streak
      ? Number((streak as { current_streak: number }).current_streak) || 0
      : 0;
    const updated = streak
      ? (streak as { updated_at: string }).updated_at
      : null;
    if (cur >= 3 && updated && new Date(updated) >= new Date(since)) {
      const ok = await insertFeedEvent(admin, {
        userId: uid,
        kind: "streak",
        payload: { days: cur },
        dedupeKey: `streak|${cur}|${new Date(updated).toISOString().slice(0, 10)}`,
        createdAt: updated,
      });
      if (ok) inserted++;
    }
  }

  // New lists
  if (inserted < MAX_SYNC_INSERTS) {
    const { data: lists } = await admin
      .from("lists")
      .select("id, title, created_at")
      .eq("user_id", uid)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of lists ?? []) {
      if (inserted >= MAX_SYNC_INSERTS) break;
      const r = row as { id: string; title: string; created_at: string };
      const ok = await insertFeedEvent(admin, {
        userId: uid,
        kind: "new-list",
        payload: { list_id: r.id, title: r.title },
        dedupeKey: `list|${r.id}`,
        createdAt: r.created_at,
      });
      if (ok) inserted++;
    }
  }

  // Milestone: round listen counts (optional, light)
  if (inserted < MAX_SYNC_INSERTS) {
    const { count: totalLogs } = await admin
      .from("logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    const n = totalLogs ?? 0;
    const milestones = [100, 500, 1000, 5000];
    for (const m of milestones) {
      if (n >= m && n < m + 15) {
        await insertFeedEvent(admin, {
          userId: uid,
          kind: "milestone",
          payload: { total_logs: n, milestone: m },
          dedupeKey: `milestone|${m}`,
          createdAt: new Date().toISOString(),
        });
        break;
      }
    }
  }
}

/** Call after creating/updating a review (rating line in feed). */
export async function recordRatingFeedEvent(
  userId: string,
  args: {
    review_id: string;
    entity_type: string;
    entity_id: string;
    rating: number;
  },
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await insertFeedEvent(admin, {
    userId,
    kind: "rating",
    payload: {
      review_id: args.review_id,
      entity_type: args.entity_type,
      entity_id: args.entity_id,
      rating: args.rating,
    },
    dedupeKey: `rating|${args.review_id}`,
    createdAt: new Date().toISOString(),
  });
}
