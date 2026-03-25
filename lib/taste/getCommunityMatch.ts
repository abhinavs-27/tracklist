import "server-only";

import { buildCommunityVector } from "@/lib/community/buildCommunityVector";
import { buildNormalizedTasteVector } from "@/lib/taste/buildTasteVector";
import { cosineSimilarity } from "@/lib/taste/cosineSimilarity";

/** Reuse a precomputed user vector to avoid rebuilding for each community. */
export async function getCommunityMatchScoreForUserVector(
  userVector: Record<string, number>,
  communityId: string,
): Promise<number> {
  const cid = communityId?.trim();
  if (!cid) return 0;
  const communityVec = await buildCommunityVector(cid);
  return cosineSimilarity(userVector, communityVec);
}

export async function getCommunityMatch(
  userId: string,
  communityId: string,
): Promise<{ score: number }> {
  const uid = userId?.trim();
  const cid = communityId?.trim();
  if (!uid || !cid) return { score: 0 };

  const userVec = await buildNormalizedTasteVector(uid);
  const score = await getCommunityMatchScoreForUserVector(userVec, cid);
  return { score };
}
