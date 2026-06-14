import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { genreKey, genreLabel } from "@/lib/taste/normalize-genre";

const CHUNK = 200;
const LOG_CAP = 5000; // per month per user — enough for even heavy listeners
const TOP_ARTISTS = 10;
const TOP_GENRES = 10;

export type TasteSnapshotRow = {
  user_id: string;
  snapshot_month: string; // 'YYYY-MM-DD' (first of month)
  top_artists: { id: string; name: string; plays: number; imageUrl?: string }[];
  top_genres: { name: string; weight: number }[];
  total_logs: number;
  obscurity_score: number | null;
  diversity_score: number;
};

/** ISO 'YYYY-MM-01' string for the given Date's calendar month. */
export function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Inclusive start / exclusive end for a calendar month. */
function monthBounds(isoMonth: string): { from: string; to: string } {
  const [y, m] = isoMonth.split("-").map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1)); // first moment of next month
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Compute and upsert a taste snapshot for one user for one calendar month.
 * Returns the upserted row, or null if the user had no logs that month.
 *
 * Safe to call repeatedly — uses ON CONFLICT DO UPDATE so re-running a month
 * refreshes the data.
 */
export async function snapshotUserMonth(
  userId: string,
  isoMonth: string, // 'YYYY-MM-DD' first of month
): Promise<TasteSnapshotRow | null> {
  const admin = createSupabaseAdminClient();
  const { from, to } = monthBounds(isoMonth);

  // 1 — Fetch logs for the month (logs has artist_id directly, no join needed)
  const { data: logs, error: logsErr } = await admin
    .from("logs")
    .select("artist_id")
    .eq("user_id", userId)
    .gte("listened_at", from)
    .lt("listened_at", to)
    .limit(LOG_CAP);

  if (logsErr) throw new Error(`[taste-snapshot] logs fetch: ${logsErr.message}`);
  if (!logs || logs.length === 0) return null;

  // 2 — Aggregate plays per artist directly
  const artistPlays = new Map<string, number>();
  for (const { artist_id } of logs) {
    if (artist_id) artistPlays.set(artist_id, (artistPlays.get(artist_id) ?? 0) + 1);
  }

  if (artistPlays.size === 0) return null;

  // 5 — Fetch artist metadata (name, genres, popularity, image)
  const artistIds = [...artistPlays.keys()];
  type ArtistMeta = {
    id: string;
    name: string;
    genres: string[] | null;
    popularity: number | null;
    image_url: string | null;
  };
  const artistMeta = new Map<string, ArtistMeta>();
  for (let i = 0; i < artistIds.length; i += CHUNK) {
    const { data: rows } = await admin
      .from("artists")
      .select("id, name, genres, popularity, image_url")
      .in("id", artistIds.slice(i, i + CHUNK));
    for (const r of (rows ?? []) as ArtistMeta[]) {
      if (r.id) artistMeta.set(r.id, r);
    }
  }

  // 6 — Top artists by play count
  const sortedArtists = [...artistPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ARTISTS);

  const topArtists = sortedArtists.map(([id, plays]) => {
    const m = artistMeta.get(id);
    return {
      id,
      name: m?.name ?? "Unknown",
      plays,
      ...(m?.image_url ? { imageUrl: m.image_url } : {}),
    };
  });

  // 7 — Genre weights: distribute each artist's plays across their genres.
  // Key by normalized genre key so "hip-hop" / "hip hop" / "Hip Hop" merge into one bucket.
  const genreWeight = new Map<string, number>();
  const genreDisplay = new Map<string, string>(); // key → display label
  let totalPopularity = 0;
  let popularityCount = 0;

  for (const [id, plays] of artistPlays) {
    const m = artistMeta.get(id);
    if (!m) continue;

    if (m.popularity != null) {
      totalPopularity += m.popularity;
      popularityCount++;
    }

    const genres = m.genres?.filter(Boolean) ?? [];
    if (genres.length === 0) continue;
    const share = plays / genres.length;
    for (const g of genres) {
      const key = genreKey(g);
      genreWeight.set(key, (genreWeight.get(key) ?? 0) + share);
      if (!genreDisplay.has(key)) genreDisplay.set(key, genreLabel(g));
    }
  }

  const maxGenreWeight = Math.max(...genreWeight.values(), 1);
  const topGenres = [...genreWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES)
    .map(([key, weight]) => ({
      name: genreDisplay.get(key) ?? key,
      weight: Math.round((weight / maxGenreWeight) * 100) / 100,
    }));

  // 8 — Scores
  const obscurityScore =
    popularityCount > 0
      ? Math.round(100 - totalPopularity / popularityCount)
      : null;
  const diversityScore = Math.min(10, genreWeight.size);

  // 9 — Upsert
  const row: TasteSnapshotRow = {
    user_id: userId,
    snapshot_month: isoMonth,
    top_artists: topArtists,
    top_genres: topGenres,
    total_logs: logs.length,
    obscurity_score: obscurityScore,
    diversity_score: diversityScore,
  };

  const { error: upsertErr } = await admin
    .from("taste_snapshots")
    .upsert(row, { onConflict: "user_id,snapshot_month" });

  if (upsertErr) throw new Error(`[taste-snapshot] upsert: ${upsertErr.message}`);

  return row;
}

/**
 * Snapshot the previous calendar month for all users who had activity.
 * Designed to run on the 2nd of each month via EventBridge.
 */
export async function snapshotAllUsersLastMonth(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const admin = createSupabaseAdminClient();

  // Previous calendar month
  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const isoMonth = monthStart(prevMonth);
  const { from, to } = { from: prevMonth.toISOString(), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString() };

  console.log(`[taste-snapshot] snapshotting month ${isoMonth}`);

  // Get all users who have logs in that month (distinct)
  const { data: activeUsers, error: usersErr } = await admin
    .from("logs")
    .select("user_id")
    .gte("listened_at", from)
    .lt("listened_at", to)
    .limit(100_000);

  if (usersErr) throw new Error(`[taste-snapshot] active users: ${usersErr.message}`);

  const userIds = [...new Set((activeUsers ?? []).map((r) => r.user_id).filter(Boolean))];
  console.log(`[taste-snapshot] ${userIds.length} active users for ${isoMonth}`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const result = await snapshotUserMonth(userId, isoMonth);
      if (result) processed++;
      else skipped++;
    } catch (e) {
      errors++;
      console.error(`[taste-snapshot] failed for ${userId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`[taste-snapshot] done — processed:${processed} skipped:${skipped} errors:${errors}`);
  return { processed, skipped, errors };
}
