import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  buildNormalizedTasteVector,
  countArtistPlaysFromLogs,
  fetchSongsArtistIds,
  normalizeTasteVector,
  TASTE_LOOKBACK_MS,
  type LogRow,
} from "@/lib/taste/buildTasteVector";
import { cosineSimilarity } from "@/lib/taste/cosineSimilarity";

const CANDIDATE_LIMIT = 80;
const TOP_N = 10;

export type UserTasteMatch = {
  userId: string;
  similarityScore: number;
};

/**
 * Cosine similarity vs other users (last 30d artist vectors). Top 10.
 */
export async function getUserMatches(
  userId: string,
): Promise<UserTasteMatch[]> {
  const uid = userId?.trim();
  if (!uid) return [];

  const mine = await buildNormalizedTasteVector(uid);
  let mineEnergy = 0;
  for (const v of Object.values(mine)) mineEnergy += v * v;
  if (mineEnergy === 0) return [];

  const admin = createSupabaseAdminClient();

  const { data: candRows, error: candErr } = await admin
    .from("users")
    .select("id")
    .neq("id", uid)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candErr || !candRows?.length) return [];

  const candidateIds = (candRows as { id: string }[])
    .map((r) => r.id)
    .filter(Boolean);

  const since = new Date(Date.now() - TASTE_LOOKBACK_MS).toISOString();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", candidateIds)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(50000);

  if (logErr) {
    console.error("[getUserMatches] logs", logErr);
    return [];
  }

  const byUser = new Map<string, LogRow[]>();
  for (const row of (logRows ?? []) as LogRow[]) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const allLogs = (logRows ?? []) as LogRow[];
  const allTrackIds = [
    ...new Set(allLogs.map((l) => l.track_id).filter(Boolean)),
  ] as string[];
  const songMap = await fetchSongsArtistIds(admin, allTrackIds);

  const scored: UserTasteMatch[] = [];

  for (const cid of candidateIds) {
    const logs = byUser.get(cid) ?? [];
    if (logs.length === 0) continue;
    const totalLogs = logs.length;
    const counts = countArtistPlaysFromLogs(logs, songMap);
    const their = normalizeTasteVector(counts, totalLogs);
    const sim = cosineSimilarity(mine, their);
    scored.push({ userId: cid, similarityScore: sim });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, TOP_N);
}
