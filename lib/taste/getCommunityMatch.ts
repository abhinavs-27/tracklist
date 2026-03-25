import "server-only";

import { buildCommunityVector } from "@/lib/community/buildCommunityVector";
import { buildNormalizedTasteVector } from "@/lib/taste/buildTasteVector";
import { cosineSimilarity } from "@/lib/taste/cosineSimilarity";

export async function getCommunityMatch(
  userId: string,
  communityId: string,
): Promise<{ score: number }> {
  const uid = userId?.trim();
  const cid = communityId?.trim();
  if (!uid || !cid) return { score: 0 };

  const [userVec, communityVec] = await Promise.all([
    buildNormalizedTasteVector(uid),
    buildCommunityVector(cid),
  ]);

  return { score: cosineSimilarity(userVec, communityVec) };
}
