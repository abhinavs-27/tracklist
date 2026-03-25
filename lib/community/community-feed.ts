import "server-only";

import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityEventType } from "@/types";

export type CommunityFeedRow = {
  id: string;
  user_id: string;
  type: CommunityEventType;
  metadata: Record<string, unknown>;
  created_at: string;
  username: string;
  avatar_url: string | null;
  /** Human-readable line for UI */
  label: string;
};

function buildLabel(
  type: CommunityEventType,
  username: string,
  meta: Record<string, unknown>,
): string {
  switch (type) {
    case "streak": {
      const days = Number(meta.days) || 0;
      return `${username} is on a ${days}-day listening streak`;
    }
    case "top_artist": {
      const name = (meta.artist_name as string) ?? "an artist";
      return `${username} is really into ${name} lately`;
    }
    case "milestone": {
      const kind = meta.kind as string | undefined;
      if (kind === "joined") return `${username} joined the community`;
      if (kind === "created") return `${username} created the community`;
      const listens = meta.listen_count as number | undefined;
      if (typeof listens === "number" && listens > 0) {
        const period = (meta.period as string) || "today";
        return `${username} logged ${listens} listen${listens === 1 ? "" : "s"} ${period}`;
      }
      return `${username} reached a milestone`;
    }
    default:
      return `${username} activity`;
  }
}

export async function getCommunityFeed(
  communityId: string,
  limit = 40,
): Promise<CommunityFeedRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_events")
    .select("id, user_id, type, metadata, created_at")
    .eq("community_id", communityId.trim())
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    user_id: string;
    type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const userMap = await fetchUserMap(admin, userIds);

  return rows.map((r) => {
    const u = userMap.get(r.user_id);
    const username = u?.username ?? "Someone";
    const type = r.type as CommunityEventType;
    return {
      id: r.id,
      user_id: r.user_id,
      type,
      metadata: r.metadata ?? {},
      created_at: r.created_at,
      username,
      avatar_url: u?.avatar_url ?? null,
      label: buildLabel(type, username, r.metadata ?? {}),
    };
  });
}
