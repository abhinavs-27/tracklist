/**
 * Co-occurrence computation: "users who interacted with X also interacted with Y".
 * Reads user activity (logs, reviews, favorites), builds per-user item sets,
 * counts pairs, normalizes scores, and writes to media_cooccurrence.
 *
 * Intended for cron or background job; use admin client for writes.
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Key for pair count: "contentId\trelatedId" (both directions stored). */
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** For each user's set of item IDs, increment co-occurrence counts for every pair. */
function addPairsToCounts(
  userItemSets: Set<string>[],
  counts: Map<string, number>,
): void {
  for (const set of userItemSets) {
    const arr = [...set];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [a, b] = pairKey(arr[i], arr[j]);
        const key = `${a}\t${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
}

/** Expand pair counts into (contentId, relatedId, rawCount) for both directions. */
function pairCountsToRows(
  counts: Map<string, number>,
): { contentId: string; relatedId: string; raw: number }[] {
  const rows: { contentId: string; relatedId: string; raw: number }[] = [];
  for (const [key, raw] of counts) {
    const [a, b] = key.split("\t");
    rows.push({ contentId: a, relatedId: b, raw });
    rows.push({ contentId: b, relatedId: a, raw });
  }
  return rows;
}

/** Normalize raw counts per content_id (divide by max so top score = 1). */
function normalizeScores(
  rows: { contentId: string; relatedId: string; raw: number }[],
): { contentId: string; relatedId: string; score: number }[] {
  const byContent = new Map<string, { relatedId: string; raw: number }[]>();
  for (const r of rows) {
    const list = byContent.get(r.contentId) ?? [];
    list.push({ relatedId: r.relatedId, raw: r.raw });
    byContent.set(r.contentId, list);
  }
  const result: { contentId: string; relatedId: string; score: number }[] = [];
  for (const [contentId, list] of byContent) {
    const max = Math.max(...list.map((x) => x.raw), 1);
    for (const { relatedId, raw } of list) {
      result.push({
        contentId,
        relatedId,
        score: Math.round((raw / max) * 100) / 100,
      });
    }
  }
  return result;
}

/**
 * Compute song co-occurrence from logs (listens) and song reviews.
 * Each user's set = song IDs they listened to ∪ song IDs they reviewed.
 */
export async function computeSongCooccurrence(): Promise<{
  usersProcessed: number;
  pairsStored: number;
}> {
  const supabase = createSupabaseAdminClient();

  const [logsRes, reviewsRes] = await Promise.all([
    supabase.from("logs").select("user_id, track_id"),
    supabase
      .from("reviews")
      .select("user_id, entity_id")
      .eq("entity_type", "song"),
  ]);

  if (logsRes.error) throw new Error(logsRes.error.message);
  if (reviewsRes.error) throw new Error(reviewsRes.error.message);

  const userSongs = new Map<string, Set<string>>();

  for (const row of logsRes.data as { user_id: string; track_id: string }[]) {
    let set = userSongs.get(row.user_id);
    if (!set) {
      set = new Set();
      userSongs.set(row.user_id, set);
    }
    set.add(row.track_id);
  }
  for (const row of reviewsRes.data as { user_id: string; entity_id: string }[]) {
    let set = userSongs.get(row.user_id);
    if (!set) {
      set = new Set();
      userSongs.set(row.user_id, set);
    }
    set.add(row.entity_id);
  }

  const userSets = [...userSongs.values()].filter((s) => s.size >= 2);
  const counts = new Map<string, number>();
  addPairsToCounts(userSets, counts);

  const rows = pairCountsToRows(counts);
  const normalized = normalizeScores(rows);

  if (normalized.length === 0) {
    return { usersProcessed: userSongs.size, pairsStored: 0 };
  }

  const now = new Date().toISOString();
  const toUpsert = normalized.map((r) => ({
    content_type: "song" as const,
    content_id: r.contentId,
    related_content_id: r.relatedId,
    score: r.score,
    updated_at: now,
  }));

  const { error } = await supabase.from("media_cooccurrence").upsert(toUpsert, {
    onConflict: "content_type,content_id,related_content_id",
  });

  if (error) throw new Error(error.message);

  return {
    usersProcessed: userSongs.size,
    pairsStored: toUpsert.length,
  };
}

/**
 * Compute album co-occurrence from album reviews, user_favorite_albums, and logs (via song's album).
 */
export async function computeAlbumCooccurrence(): Promise<{
  usersProcessed: number;
  pairsStored: number;
}> {
  const supabase = createSupabaseAdminClient();

  const [reviewsRes, favRes, logsSongsRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("user_id, entity_id")
      .eq("entity_type", "album"),
    supabase.from("user_favorite_albums").select("user_id, album_id"),
    supabase.from("logs").select("user_id, track_id"),
  ]);

  if (reviewsRes.error) throw new Error(reviewsRes.error.message);
  if (favRes.error) throw new Error(favRes.error.message);
  if (logsSongsRes.error) throw new Error(logsSongsRes.error.message);

  const trackIds = [
    ...new Set(
      (logsSongsRes.data as { track_id: string }[]).map((r) => r.track_id),
    ),
  ];
  const trackToAlbum = new Map<string, string>();
  if (trackIds.length > 0) {
    const batch = 500;
    for (let i = 0; i < trackIds.length; i += batch) {
      const chunk = trackIds.slice(i, i + batch);
      const { data } = await supabase
        .from("songs")
        .select("id, album_id")
        .in("id", chunk);
      for (const row of (data ?? []) as { id: string; album_id: string }[]) {
        trackToAlbum.set(row.id, row.album_id);
      }
    }
  }

  const userAlbums = new Map<string, Set<string>>();

  for (const row of reviewsRes.data as { user_id: string; entity_id: string }[]) {
    let set = userAlbums.get(row.user_id);
    if (!set) {
      set = new Set();
      userAlbums.set(row.user_id, set);
    }
    set.add(row.entity_id);
  }
  for (const row of favRes.data as { user_id: string; album_id: string }[]) {
    let set = userAlbums.get(row.user_id);
    if (!set) {
      set = new Set();
      userAlbums.set(row.user_id, set);
    }
    set.add(row.album_id);
  }
  for (const row of logsSongsRes.data as { user_id: string; track_id: string }[]) {
    const albumId = trackToAlbum.get(row.track_id);
    if (!albumId) continue;
    let set = userAlbums.get(row.user_id);
    if (!set) {
      set = new Set();
      userAlbums.set(row.user_id, set);
    }
    set.add(albumId);
  }

  const userSets = [...userAlbums.values()].filter((s) => s.size >= 2);
  const counts = new Map<string, number>();
  addPairsToCounts(userSets, counts);

  const rows = pairCountsToRows(counts);
  const normalized = normalizeScores(rows);

  if (normalized.length === 0) {
    return { usersProcessed: userAlbums.size, pairsStored: 0 };
  }

  const now = new Date().toISOString();
  const toUpsert = normalized.map((r) => ({
    content_type: "album" as const,
    content_id: r.contentId,
    related_content_id: r.relatedId,
    score: r.score,
    updated_at: now,
  }));

  const { error } = await supabase.from("media_cooccurrence").upsert(toUpsert, {
    onConflict: "content_type,content_id,related_content_id",
  });

  if (error) throw new Error(error.message);

  return {
    usersProcessed: userAlbums.size,
    pairsStored: toUpsert.length,
  };
}
