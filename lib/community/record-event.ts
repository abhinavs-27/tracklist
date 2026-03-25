import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityEventType } from "@/types";

/**
 * Insert a community feed row. Call from streak hooks / weekly jobs when ready.
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
  return { ok: true };
}
