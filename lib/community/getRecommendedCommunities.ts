import "server-only";

import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { recommendedFitLabel } from "@/lib/community/recommendedLabels";
import {
  getCommunityMatchScoreForUserVector,
} from "@/lib/taste/getCommunityMatch";
import { buildNormalizedTasteVector } from "@/lib/taste/buildTasteVector";

/** Fewer candidates = fewer `buildCommunityVector` calls (each scans member logs). */
const PUBLIC_POOL = 18;
const TOP_N = 8;
const BATCH = 6;
/** Below this max score we blend in popular communities. */
const STRONG_MATCH_FLOOR = 0.35;

export type RecommendedCommunity = {
  communityId: string;
  name: string;
  score: number;
  label: string;
  /** True when taste match was weak and we filled from popularity / recency. */
  isFallback: boolean;
  memberCount: number;
};

/** One round-trip per chunk instead of N `count` queries. */
async function countMembersByCommunityIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  communityIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (communityIds.length === 0) return out;
  for (const id of communityIds) out.set(id, 0);
  const CHUNK = 120;
  for (let i = 0; i < communityIds.length; i += CHUNK) {
    const chunk = communityIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("community_members")
      .select("community_id")
      .in("community_id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const id = (row as { community_id: string }).community_id;
      out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}

async function getJoinedCommunityIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set(
    (data as { community_id: string }[]).map((r) => r.community_id),
  );
}

/**
 * Public communities the user is not in, ordered by member count (popular).
 */
async function getFallbackPublicCommunities(
  userId: string,
  joined: Set<string>,
  limit: number,
): Promise<RecommendedCommunity[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("communities")
    .select("id, name, created_at")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !rows?.length) return [];

  const candidates = (rows as { id: string; name: string; created_at: string }[])
    .filter((r) => !joined.has(r.id));

  const memberCounts = await countMembersByCommunityIds(
    admin,
    candidates.map((c) => c.id),
  );

  const withCounts = candidates.map((c) => ({
    communityId: c.id,
    name: c.name,
    memberCount: memberCounts.get(c.id) ?? 0,
    created_at: c.created_at,
  }));

  withCounts.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  return withCounts.slice(0, limit).map((c) => ({
    communityId: c.communityId,
    name: c.name,
    score: 0,
    label: c.memberCount >= 3 ? "Popular" : "New",
    isFallback: true,
    memberCount: c.memberCount,
  }));
}

/**
 * Taste-based public community picks; falls back to popular/recent if matches are weak.
 */
async function computeRecommendedCommunities(
  userId: string,
): Promise<RecommendedCommunity[]> {
  const uid = userId?.trim();
  if (!uid) return [];

  const admin = createSupabaseAdminClient();
  const joined = await getJoinedCommunityIds(admin, uid);

  const { data: publicRows, error: pubErr } = await admin
    .from("communities")
    .select("id, name")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(PUBLIC_POOL);

  if (pubErr || !publicRows?.length) {
    return getFallbackPublicCommunities(uid, joined, TOP_N);
  }

  const candidates = (publicRows as { id: string; name: string }[]).filter(
    (r) => !joined.has(r.id),
  );

  if (candidates.length === 0) {
    return [];
  }

  const userVec = await buildNormalizedTasteVector(uid);
  let hasSignal = false;
  for (const v of Object.values(userVec)) {
    if (v > 0) {
      hasSignal = true;
      break;
    }
  }

  if (!hasSignal) {
    return getFallbackPublicCommunities(uid, joined, TOP_N);
  }

  const scoredNoCount: {
    communityId: string;
    name: string;
    score: number;
  }[] = [];

  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const part = await Promise.all(
      chunk.map(async (c) => {
        const score = await getCommunityMatchScoreForUserVector(
          userVec,
          c.id,
        );
        return {
          communityId: c.id,
          name: c.name,
          score,
        };
      }),
    );
    scoredNoCount.push(...part);
  }

  const counts = await countMembersByCommunityIds(
    admin,
    scoredNoCount.map((s) => s.communityId),
  );
  const scored = scoredNoCount.map((s) => ({
    ...s,
    memberCount: counts.get(s.communityId) ?? 0,
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored.slice(0, TOP_N);
  const maxScore = best[0]?.score ?? 0;

  if (maxScore < STRONG_MATCH_FLOOR || best.length === 0) {
    const fallback = await getFallbackPublicCommunities(uid, joined, TOP_N);
    if (fallback.length === 0) return [];
    const tasteTop = best
      .filter((b) => b.score >= 0.2)
      .slice(0, 3)
      .map((b) => ({
        communityId: b.communityId,
        name: b.name,
        score: b.score,
        label: recommendedFitLabel(b.score),
        isFallback: false,
        memberCount: b.memberCount,
      }));
    const merged = [...tasteTop];
    const seen = new Set(merged.map((m) => m.communityId));
    for (const f of fallback) {
      if (merged.length >= TOP_N) break;
      if (!seen.has(f.communityId)) {
        merged.push(f);
        seen.add(f.communityId);
      }
    }
    return merged.slice(0, TOP_N);
  }

  return best.map((b) => ({
    communityId: b.communityId,
    name: b.name,
    score: b.score,
    label: recommendedFitLabel(b.score),
    isFallback: false,
    memberCount: b.memberCount,
  }));
}

/**
 * Cached a few minutes per user — recommendations are not realtime; avoids
 * repeating many community vector scans on every navigation.
 */
export async function getRecommendedCommunities(
  userId: string,
): Promise<RecommendedCommunity[]> {
  const uid = userId?.trim();
  if (!uid) return [];
  return unstable_cache(
    () => computeRecommendedCommunities(uid),
    ["recommended-communities", uid],
    { revalidate: 180 },
  )();
}
