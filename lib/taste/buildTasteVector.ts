import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TASTE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOG_ROWS = 50000;

type LogRow = {
  user_id: string;
  listened_at: string;
  artist_id: string | null;
  track_id: string | null;
};

export async function fetchSongsArtistIds(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(trackIds)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
      .select("id, artist_id")
      .in("id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const r = row as { id: string; artist_id: string };
      out.set(r.id, r.artist_id);
    }
  }
  return out;
}

function resolveArtistId(
  log: LogRow,
  songMap: Map<string, string>,
): string | null {
  const aid =
    log.artist_id?.trim() ||
    (log.track_id ? songMap.get(log.track_id) : undefined);
  return aid?.trim() || null;
}

/**
 * Raw play counts per Spotify artist id from logs in the last 30 days.
 */
export async function buildTasteVector(
  userId: string,
): Promise<Record<string, number>> {
  const admin = createSupabaseAdminClient();
  const uid = userId?.trim();
  if (!uid) return {};

  const since = new Date(Date.now() - TASTE_LOOKBACK_MS).toISOString();

  const { data: logRows, error } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .eq("user_id", uid)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (error || !logRows?.length) return {};

  const logs = logRows as LogRow[];
  const counts: Record<string, number> = {};
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);
  for (const log of logs) {
    const aid = resolveArtistId(log, songMap);
    if (!aid) continue;
    counts[aid] = (counts[aid] ?? 0) + 1;
  }
  return counts;
}

/** Sync: counts per artist given a pre-built track → artist map. */
export function countArtistPlaysFromLogs(
  logs: LogRow[],
  songMap: Map<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const aid = resolveArtistId(log, songMap);
    if (!aid) continue;
    counts[aid] = (counts[aid] ?? 0) + 1;
  }
  return counts;
}

/**
 * Raw play counts per artist from log rows (single-user batch).
 */
export async function aggregateCountsFromLogs(
  logs: LogRow[],
  admin: SupabaseClient,
): Promise<Record<string, number>> {
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);
  return countArtistPlaysFromLogs(logs, songMap);
}

/**
 * Each count / total log rows in the window (including rows without a resolved artist).
 */
export function normalizeTasteVector(
  counts: Record<string, number>,
  totalLogs: number,
): Record<string, number> {
  if (totalLogs <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    out[k] = v / totalLogs;
  }
  return out;
}

export async function buildNormalizedTasteVector(
  userId: string,
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - TASTE_LOOKBACK_MS).toISOString();
  return buildNormalizedTasteVectorForRange(userId, since, null);
}

/**
 * Normalized artist weights from logs in [sinceIso, untilIso).
 * `untilIso` null → now.
 */
export async function buildNormalizedTasteVectorForRange(
  userId: string,
  sinceIso: string,
  untilIso: string | null,
): Promise<Record<string, number>> {
  const admin = createSupabaseAdminClient();
  const uid = userId?.trim();
  if (!uid) return {};

  let q = admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .eq("user_id", uid)
    .gte("listened_at", sinceIso)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (untilIso) {
    q = q.lt("listened_at", untilIso);
  }

  const { data: logRows, error } = await q;

  if (error || !logRows?.length) return {};

  const logs = logRows as LogRow[];
  const totalLogs = logs.length;
  const counts = await aggregateCountsFromLogs(logs, admin);
  return normalizeTasteVector(counts, totalLogs);
}

/**
 * Build raw + normalized vectors from an in-memory list of log rows (same user).
 */
export function buildTasteVectorsFromLogs(
  logs: LogRow[],
  songMap: Map<string, string>,
): { raw: Record<string, number>; normalized: Record<string, number>; totalLogs: number } {
  const totalLogs = logs.length;
  const raw: Record<string, number> = {};
  for (const log of logs) {
    const aid = resolveArtistId(log, songMap);
    if (!aid) continue;
    raw[aid] = (raw[aid] ?? 0) + 1;
  }
  return {
    raw,
    normalized: normalizeTasteVector(raw, totalLogs),
    totalLogs,
  };
}

export { TASTE_LOOKBACK_MS, MAX_LOG_ROWS };
export type { LogRow };
