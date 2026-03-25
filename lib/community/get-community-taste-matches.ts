import "server-only";

import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type TasteMatchPeer = {
  userId: string;
  username: string;
  avatar_url: string | null;
  similarity_score: number;
};

/**
 * Top 3 most similar and 3 least similar members (from weekly `community_taste_match` job).
 */
export async function getCommunityTasteMatchesForViewer(
  communityId: string,
  viewerUserId: string,
): Promise<{ similar: TasteMatchPeer[]; opposite: TasteMatchPeer[] }> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  const vid = viewerUserId?.trim();
  if (!cid || !vid) return { similar: [], opposite: [] };

  const { data: high, error: e1 } = await admin
    .from("community_taste_match")
    .select("member_id, similarity_score")
    .eq("community_id", cid)
    .eq("user_id", vid)
    .order("similarity_score", { ascending: false })
    .limit(3);

  const { data: low, error: e2 } = await admin
    .from("community_taste_match")
    .select("member_id, similarity_score")
    .eq("community_id", cid)
    .eq("user_id", vid)
    .order("similarity_score", { ascending: true })
    .limit(3);

  if (e1 || e2) {
    console.error("[taste-matches]", e1 ?? e2);
    return { similar: [], opposite: [] };
  }

  const ids = [
    ...new Set([
      ...(high ?? []).map((r: { member_id: string }) => r.member_id),
      ...(low ?? []).map((r: { member_id: string }) => r.member_id),
    ]),
  ];
  const userMap = await fetchUserMap(admin, ids);

  function mapRows(
    rows: { member_id: string; similarity_score: number }[] | null,
  ): TasteMatchPeer[] {
    return (rows ?? []).map((r) => {
      const u = userMap.get(r.member_id);
      return {
        userId: r.member_id,
        username: u?.username ?? "Unknown",
        avatar_url: u?.avatar_url ?? null,
        similarity_score: Number(r.similarity_score) || 0,
      };
    });
  }

  return {
    similar: mapRows(high as { member_id: string; similarity_score: number }[]),
    opposite: mapRows(low as { member_id: string; similarity_score: number }[]),
  };
}
