import "server-only";

import { insertCommunityFeedSingle } from "@/lib/community/community-feed-insert";
import { mapCommunityEventToFeedPayload } from "@/lib/community/map-community-event-to-feed";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityEventType } from "@/types";

/**
 * Insert legacy `community_events` row and mirror into `community_feed` when mappable.
 */
export async function recordCommunityEvent(args: {
  communityId: string;
  userId: string;
  type: CommunityEventType;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("community_events").insert({
    community_id: args.communityId.trim(),
    user_id: args.userId.trim(),
    type: args.type,
    metadata: args.metadata ?? {},
  });
  if (error) {
    console.warn("[community] recordCommunityEvent failed", error.message);
    return { ok: false };
  }

  const mapped = mapCommunityEventToFeedPayload(args.type, args.metadata ?? {});
  await insertCommunityFeedSingle({
    communityId: args.communityId,
    userId: args.userId,
    eventType: mapped.eventType,
    payload: mapped.payload,
  });

  return { ok: true };
}
