import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { cosineSimilarity } from "@/lib/taste/cosineSimilarity";
import type { TasteIdentity, TasteTopArtist } from "@/lib/taste/types";

const CANDIDATE_LIMIT = 80;
const TOP_N = 10;

export type UserTasteMatch = {
  userId: string;
  similarityScore: number;
};

/**
 * Build a normalized artist-weight vector from precomputed topArtists.
 * Normalizes by total play count so two users with different activity
 * levels are compared on relative taste, not raw volume.
 */
function vectorFromTopArtists(
  artists: TasteTopArtist[],
): Record<string, number> {
  if (!artists.length) return {};
  const total = artists.reduce((s, a) => s + (a.listenCount ?? 0), 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const a of artists) {
    if (a.id && (a.listenCount ?? 0) > 0) {
      out[a.id] = a.listenCount / total;
    }
  }
  return out;
}

/**
 * Cosine-similarity taste matches using `taste_identity_cache`.
 *
 * Previous approach: scan 12,000 raw log rows from 80 candidates + resolve
 * all track_ids to artist_ids. Replaced with a single batch read of the
 * precomputed cache — orders of magnitude faster.
 */
export async function getUserMatches(
  userId: string,
): Promise<UserTasteMatch[]> {
  const uid = userId?.trim();
  if (!uid) return [];

  const admin = createSupabaseAdminClient();

  // Fetch viewing user's precomputed taste identity.
  const { data: myRow } = await admin
    .from("taste_identity_cache")
    .select("payload")
    .eq("user_id", uid)
    .maybeSingle();

  const myPayload = myRow?.payload as TasteIdentity | null;
  const mine = vectorFromTopArtists(myPayload?.topArtists ?? []);

  let mineEnergy = 0;
  for (const v of Object.values(mine)) mineEnergy += v * v;
  if (mineEnergy === 0) return [];

  // Candidate users — most recently created.
  const { data: candRows, error: candErr } = await admin
    .from("users")
    .select("id")
    .neq("id", uid)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candErr || !candRows?.length) return [];

  const candidateIds = (candRows as { id: string }[]).map((r) => r.id);

  // One batch read replaces 12k log rows + track resolution.
  const { data: cacheRows, error: cacheErr } = await admin
    .from("taste_identity_cache")
    .select("user_id, payload")
    .in("user_id", candidateIds);

  if (cacheErr) {
    console.error("[getUserMatches] taste_identity_cache fetch", cacheErr);
    return [];
  }

  const payloadByUser = new Map<string, TasteIdentity>();
  for (const row of (cacheRows ?? []) as { user_id: string; payload: TasteIdentity }[]) {
    if (row.payload) payloadByUser.set(row.user_id, row.payload);
  }

  const scored: UserTasteMatch[] = [];

  for (const cid of candidateIds) {
    const payload = payloadByUser.get(cid);
    if (!payload?.topArtists?.length) continue;
    const their = vectorFromTopArtists(payload.topArtists);
    const sim = cosineSimilarity(mine, their);
    if (sim > 0) scored.push({ userId: cid, similarityScore: sim });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, TOP_N);
}
