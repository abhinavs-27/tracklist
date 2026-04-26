import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CommunityInvitePending, CommunityRow } from "@/types";

import { canInviteToCommunity } from "@/lib/community/permissions";
import { recordCommunityEvent } from "@/lib/community/record-event";
import { getCommunityById, getCommunityMemberRole } from "@/lib/community/queries";

export async function getPendingInviteForUserToCommunity(
  communityId: string,
  userId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ id: string } | null> {
  const sb = supabase ?? createSupabaseAdminClient();
  const { data, error } = await sb
    .from("community_invites")
    .select("id")
    .eq("community_id", communityId.trim())
    .eq("invited_user_id", userId.trim())
    .eq("status", "pending")
    .maybeSingle();
  if (error || !data) return null;
  return { id: (data as { id: string }).id };
}

export async function listPendingInvitesForUser(
  userId: string,
): Promise<CommunityInvitePending[]> {
  const admin = createSupabaseAdminClient();
  const uid = userId.trim();
  if (!uid) return [];

  const { data: invites, error } = await admin
    .from("community_invites")
    .select("id, community_id, invited_by, invited_user_id, status, created_at")
    .eq("invited_user_id", uid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !invites?.length) return [];

  const rows = invites as {
    id: string;
    community_id: string;
    invited_by: string;
    invited_user_id: string;
    status: string;
    created_at: string;
  }[];

  const commIds = [...new Set(rows.map((r) => r.community_id))];
  const inviterIds = [...new Set(rows.map((r) => r.invited_by))];

  const [{ data: comms }, { data: users }] = await Promise.all([
    admin
      .from("communities")
      .select("id, name, is_private")
      .in("id", commIds),
    admin.from("users").select("id, username").in("id", inviterIds),
  ]);

  const commMap = new Map(
    (comms ?? []).map((c) => [c.id, c as CommunityRow]),
  );
  const userMap = new Map(
    (users ?? []).map((u) => [(u as { id: string }).id, (u as { username: string }).username]),
  );

  const out: CommunityInvitePending[] = [];
  for (const r of rows) {
    const c = commMap.get(r.community_id);
    if (!c) continue;
    out.push({
      id: r.id,
      community_id: r.community_id,
      invited_by: r.invited_by,
      invited_user_id: r.invited_user_id,
      status: "pending",
      created_at: r.created_at,
      community: { id: c.id, name: c.name, is_private: c.is_private },
      invited_by_username: userMap.get(r.invited_by) ?? "Someone",
    });
  }
  return out;
}

export type CreateInviteResult =
  | { ok: true; inviteId: string }
  | { ok: false; reason: string };

async function notifyInviteeOfCommunityInvite(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  invitedUserId: string,
  actorUserId: string,
  communityId: string,
): Promise<void> {
  const { error } = await admin.from("notifications").insert({
    user_id: invitedUserId,
    actor_user_id: actorUserId,
    type: "community_invite",
    entity_type: "community",
    entity_id: communityId,
  });
  if (error) {
    console.warn(
      "[community] invite notification insert failed",
      error.message,
    );
  }
}

/**
 * Owner invites a user. Public or private communities. Idempotent re-send after decline.
 */
export async function createCommunityInvite(
  communityId: string,
  ownerUserId: string,
  invitedUserId: string,
): Promise<CreateInviteResult> {
  const cid = communityId.trim();
  const owner = ownerUserId.trim();
  const invitee = invitedUserId.trim();

  if (!cid || !owner || !invitee) {
    return { ok: false, reason: "invalid" };
  }
  if (owner === invitee) {
    return { ok: false, reason: "self" };
  }

  const community = await getCommunityById(cid);
  if (!community) {
    return { ok: false, reason: "not_found" };
  }

  const role = await getCommunityMemberRole(cid, owner);
  if (role === null || !canInviteToCommunity(community.is_private, true, role)) {
    return { ok: false, reason: "forbidden" };
  }

  const admin = createSupabaseAdminClient();

  const { data: alreadyMember } = await admin
    .from("community_members")
    .select("id")
    .eq("community_id", cid)
    .eq("user_id", invitee)
    .maybeSingle();
  if (alreadyMember) {
    return { ok: false, reason: "already_member" };
  }

  const { data: existing } = await admin
    .from("community_invites")
    .select("id, status")
    .eq("community_id", cid)
    .eq("invited_user_id", invitee)
    .maybeSingle();

  if (existing) {
    const st = (existing as { status: string }).status;
    if (st === "pending") {
      return { ok: false, reason: "already_invited" };
    }
    if (st === "accepted") {
      return { ok: false, reason: "already_member" };
    }
    if (st === "declined") {
      const { data: updated, error: upErr } = await admin
        .from("community_invites")
        .update({
          status: "pending",
          invited_by: owner,
          created_at: new Date().toISOString(),
        })
        .eq("id", (existing as { id: string }).id)
        .eq("status", "declined")
        .select("id")
        .maybeSingle();
      if (upErr || !updated) {
        return { ok: false, reason: "error" };
      }
      await notifyInviteeOfCommunityInvite(admin, invitee, owner, cid);
      return { ok: true, inviteId: (updated as { id: string }).id };
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from("community_invites")
    .insert({
      community_id: cid,
      invited_by: owner,
      invited_user_id: invitee,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[community] invite insert", insErr);
    return { ok: false, reason: "error" };
  }

  await notifyInviteeOfCommunityInvite(admin, invitee, owner, cid);

  return { ok: true, inviteId: (inserted as { id: string }).id };
}

export type InviteMutationResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function acceptCommunityInvite(
  inviteId: string,
  userId: string,
): Promise<InviteMutationResult> {
  const admin = createSupabaseAdminClient();
  const iid = inviteId.trim();
  const uid = userId.trim();

  const { data: inv, error: fetchErr } = await admin
    .from("community_invites")
    .select("id, community_id, invited_user_id, status")
    .eq("id", iid)
    .maybeSingle();

  if (fetchErr || !inv) {
    return { ok: false, reason: "not_found" };
  }

  const row = inv as {
    id: string;
    community_id: string;
    invited_user_id: string;
    status: string;
  };

  if (row.invited_user_id !== uid) {
    return { ok: false, reason: "forbidden" };
  }
  if (row.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }

  const { data: existingMember } = await admin
    .from("community_members")
    .select("id")
    .eq("community_id", row.community_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (existingMember) {
    await admin
      .from("community_invites")
      .update({ status: "accepted" })
      .eq("id", iid);
    return { ok: true };
  }

  const { error: memErr } = await admin.from("community_members").insert({
    community_id: row.community_id,
    user_id: uid,
    role: "member",
  });
  if (memErr) {
    console.error("[community] accept invite member", memErr);
    return { ok: false, reason: "error" };
  }

  const { error: upErr } = await admin
    .from("community_invites")
    .update({ status: "accepted" })
    .eq("id", iid)
    .eq("status", "pending");
  if (upErr) {
    console.error("[community] accept invite status", upErr);
  }

  await recordCommunityEvent({
    communityId: row.community_id,
    userId: uid,
    type: "milestone",
    metadata: { kind: "joined" },
  });

  return { ok: true };
}

/**
 * When a user is in this community through another path (e.g. share link),
 * mark any pending direct invite so the invites UI stays consistent.
 */
export async function markPendingDirectInviteAcceptedForMember(
  communityId: string,
  userId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return;

  const { error } = await admin
    .from("community_invites")
    .update({ status: "accepted" })
    .eq("community_id", cid)
    .eq("invited_user_id", uid)
    .eq("status", "pending");
  if (error) {
    console.warn(
      "[community] mark pending invite accepted for member",
      error.message,
    );
  }
}

export async function declineCommunityInvite(
  inviteId: string,
  userId: string,
): Promise<InviteMutationResult> {
  const admin = createSupabaseAdminClient();
  const iid = inviteId.trim();
  const uid = userId.trim();

  const { data: inv, error: fetchErr } = await admin
    .from("community_invites")
    .select("id, invited_user_id, status")
    .eq("id", iid)
    .maybeSingle();

  if (fetchErr || !inv) {
    return { ok: false, reason: "not_found" };
  }

  const row = inv as { invited_user_id: string; status: string };
  if (row.invited_user_id !== uid) {
    return { ok: false, reason: "forbidden" };
  }
  if (row.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }

  const { error: upErr } = await admin
    .from("community_invites")
    .update({ status: "declined" })
    .eq("id", iid)
    .eq("status", "pending");
  if (upErr) {
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}
