import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Matches `get_community_listen_sessions` / `get_feed_listen_sessions` row shape. */
export type CommunityListenSessionRow = {
  type: string;
  user_id: string;
  track_id: string;
  album_id: string;
  track_name: string | null;
  artist_name: string | null;
  song_count: number;
  first_listened_at: string;
  created_at: string;
};

export async function getCommunityListenSessionsRpc(
  communityId: string,
  limit: number,
  cursor: string | null = null,
): Promise<CommunityListenSessionRow[]> {
  const cid = communityId?.trim();
  if (!cid) return [];
  const admin = createSupabaseAdminClient();
  const capped = Math.min(Math.max(1, limit), 100);
  const { data, error } = await admin.rpc("get_community_listen_sessions", {
    p_community_id: cid,
    p_cursor: cursor,
    p_limit: capped,
  });
  if (error) {
    console.error("[community-feed] get_community_listen_sessions", error.message);
    return [];
  }
  return (data ?? []) as CommunityListenSessionRow[];
}
