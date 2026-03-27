import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Remove a user from a community and scrub their community-scoped rows so
 * feeds, taste pairs, and stats stay consistent (FKs do not all CASCADE on
 * membership removal alone).
 */
export async function leaveCommunity(
  communityId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_member" | "error" }> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return { ok: false, reason: "error" };

  const { data: mem, error: memErr } = await admin
    .from("community_members")
    .select("id")
    .eq("community_id", cid)
    .eq("user_id", uid)
    .maybeSingle();
  if (memErr || !mem) {
    return { ok: false, reason: "not_member" };
  }

  const warn = (label: string, err: { message?: string } | null) => {
    if (err?.message) {
      console.warn(`[community] leave cleanup ${label}`, err.message);
    }
  };

  const { error: fac } = await admin
    .from("feed_activity_comments")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("feed_activity_comments", fac);

  const { error: cf } = await admin
    .from("community_feed")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("community_feed", cf);

  const { error: tm1 } = await admin
    .from("community_taste_match")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("community_taste_match viewer", tm1);

  const { error: tm2 } = await admin
    .from("community_taste_match")
    .delete()
    .eq("community_id", cid)
    .eq("member_id", uid);
  warn("community_taste_match member", tm2);

  const { error: ms } = await admin
    .from("community_member_stats")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("community_member_stats", ms);

  const { error: mr } = await admin
    .from("community_member_roles")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("community_member_roles", mr);

  const { error: ev } = await admin
    .from("community_events")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  warn("community_events", ev);

  const { error: inv } = await admin
    .from("community_invites")
    .delete()
    .eq("community_id", cid)
    .eq("invited_user_id", uid);
  warn("community_invites", inv);

  const { error: leaveErr } = await admin
    .from("community_members")
    .delete()
    .eq("community_id", cid)
    .eq("user_id", uid);
  if (leaveErr) {
    console.error("[community] leave member row", leaveErr);
    return { ok: false, reason: "error" };
  }

  return { ok: true };
}
