import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { recommendedFitLabel } from "@/lib/community/recommendedLabels";
import {
  getCommunityMatchScoreForUserVector,
} from "@/lib/taste/getCommunityMatch";
import { buildNormalizedTasteVector } from "@/lib/taste/buildTasteVector";

const PUBLIC_POOL = 50;
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

  const withCounts = await Promise.all(
    candidates.map(async (c) => {
      const { count } = await admin
        .from("community_members")
        .select("id", { count: "exact", head: true })
        .eq("community_id", c.id);
      return {
        communityId: c.id,
        name: c.name,
        memberCount: count ?? 0,
        created_at: c.created_at,
      };
    }),
  );

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
export async function getRecommendedCommunities(
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

  const scored: {
    communityId: string;
    name: string;
    score: number;
    memberCount: number;
  }[] = [];

  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const part = await Promise.all(
      chunk.map(async (c) => {
        const score = await getCommunityMatchScoreForUserVector(
          userVec,
          c.id,
        );
        const { count } = await admin
          .from("community_members")
          .select("id", { count: "exact", head: true })
          .eq("community_id", c.id);
        return {
          communityId: c.id,
          name: c.name,
          score,
          memberCount: count ?? 0,
        };
      }),
    );
    scored.push(...part);
  }

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
