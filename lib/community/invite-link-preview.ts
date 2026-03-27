import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getCommunityById, getCommunityMemberCount } from "@/lib/community/queries";
import type { CommunityRow } from "@/types";

/**
 * Invite landing pages intentionally skip consensus rankings (`get_community_consensus_rankings`
 * RPC + song/album enrichment) — that path was several seconds on larger communities and blocked TTFB.
 */

export type CommunityActivityPreview = {
  id: string;
  type: string;
  created_at: string;
  user_id: string;
  username: string | null;
  metadata: Record<string, unknown>;
};

export type CommunityInvitePreview = {
  community: CommunityRow;
  member_count: number;
  top_tracks: Array<{
    entityId: string;
    name: string;
    image: string | null;
    uniqueListeners: number;
    score: number;
  }>;
  recent_activity: CommunityActivityPreview[];
};

/**
 * Public preview for invite landing pages (no membership required).
 */
export async function getCommunityInvitePreview(
  communityId: string,
): Promise<CommunityInvitePreview | null> {
  const cid = communityId.trim();
  if (!cid) return null;

  const community = await getCommunityById(cid);
  if (!community) return null;

  const [member_count, events] = await Promise.all([
    getCommunityMemberCount(cid),
    fetchRecentCommunityEventsPreview(cid, 6),
  ]);

  return {
    community,
    member_count,
    top_tracks: [],
    recent_activity: events,
  };
}

async function fetchRecentCommunityEventsPreview(
  communityId: string,
  limit: number,
): Promise<CommunityActivityPreview[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("community_events")
    .select("id, type, created_at, user_id, metadata")
    .eq("community_id", communityId.trim())
    .order("created_at", { ascending: false })
    .limit(Math.min(20, Math.max(1, limit)));

  if (error || !rows?.length) return [];

  const userIds = [
    ...new Set(
      (rows as { user_id: string }[]).map((r) => r.user_id).filter(Boolean),
    ),
  ];
  const { data: users } = await admin
    .from("users")
    .select("id, username")
    .in("id", userIds);
  const nameById = new Map(
    (users ?? []).map((u) => [(u as { id: string }).id, (u as { username: string }).username]),
  );

  return (rows as Array<{
    id: string;
    type: string;
    created_at: string;
    user_id: string;
    metadata: unknown;
  }>)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      type: r.type,
      created_at: r.created_at,
      user_id: r.user_id,
      username: nameById.get(r.user_id) ?? null,
      metadata:
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {},
    }));
}
