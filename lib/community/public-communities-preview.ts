import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PublicCommunityPreview = {
  id: string;
  name: string;
  memberCount: number;
};

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

/**
 * Public communities for the logged-out home feed: recent public communities, ranked by member count.
 */
export async function getPublicCommunitiesPreview(
  limit: number,
): Promise<PublicCommunityPreview[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("communities")
    .select("id, name, created_at")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(48);

  if (error || !rows?.length) return [];

  const ids = (rows as { id: string; name: string }[]).map((r) => r.id);
  const counts = await countMembersByCommunityIds(admin, ids);

  const withCounts = (rows as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    memberCount: counts.get(r.id) ?? 0,
  }));

  withCounts.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return a.name.localeCompare(b.name);
  });

  return withCounts.slice(0, Math.max(1, Math.min(limit, 12)));
}
