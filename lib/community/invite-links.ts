import "server-only";

import { randomUUID } from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

import { markPendingDirectInviteAcceptedForMember } from "@/lib/community/invites";
import { canInviteToCommunity } from "@/lib/community/permissions";
import { recordCommunityEvent } from "@/lib/community/record-event";
import {
  getCommunityById,
  getCommunityMemberRole,
  isCommunityMember,
} from "@/lib/community/queries";
import type { CommunityMemberRole } from "@/lib/community/member-role";

export type CommunityInviteLinkRow = {
  id: string;
  community_id: string;
  token: string;
  created_by_user_id: string;
  created_at: string;
  expires_at: string | null;
};

function normalizeToken(raw: string): string {
  return raw.trim();
}

export async function getInviteLinkByToken(
  token: string,
): Promise<CommunityInviteLinkRow | null> {
  const t = normalizeToken(token);
  if (!t) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_invite_links")
    .select("id, community_id, token, created_by_user_id, created_at, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (error || !data) return null;
  return data as CommunityInviteLinkRow;
}

export function isInviteLinkExpired(row: CommunityInviteLinkRow): boolean {
  if (!row.expires_at) return false;
  return new Date(row.expires_at).getTime() <= Date.now();
}

/**
 * Creates a shareable invite link. Only community admins (or any member for private communities).
 */
export async function createCommunityInviteLink(args: {
  communityId: string;
  actorUserId: string;
  /** If omitted or null, link does not expire. */
  expiresAt: Date | null;
}): Promise<
  | { ok: true; token: string; id: string }
  | { ok: false; reason: "not_found" | "forbidden" | "error" }
> {
  const cid = args.communityId.trim();
  const actor = args.actorUserId.trim();
  if (!cid || !actor) return { ok: false, reason: "error" };

  const community = await getCommunityById(cid);
  if (!community) return { ok: false, reason: "not_found" };

  const isMember = await isCommunityMember(cid, actor);
  const role = await getCommunityMemberRole(cid, actor);
  if (
    !isMember ||
    role === null ||
    !canInviteToCommunity(community.is_private, true, role as CommunityMemberRole)
  ) {
    return { ok: false, reason: "forbidden" };
  }

  const token = randomUUID();
  const admin = createSupabaseAdminClient();
  const { data: inserted, error } = await admin
    .from("community_invite_links")
    .insert({
      community_id: cid,
      token,
      created_by_user_id: actor,
      expires_at: args.expiresAt ? args.expiresAt.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[community] invite link insert", error);
    return { ok: false, reason: "error" };
  }

  return { ok: true, token, id: (inserted as { id: string }).id };
}

export type JoinViaInviteLinkResult =
  | { ok: true; communityId: string; alreadyMember: boolean }
  | { ok: false; reason: string };

/**
 * Idempotent: adds the user as a member when the invite token is valid and not expired.
 * Private communities are joinable only with a valid link (or direct user invite flow elsewhere).
 */
export async function joinCommunityViaInviteLink(
  token: string,
  userId: string,
  options?: {
    /** When the caller already loaded the link row (e.g. invite page), skip a duplicate DB fetch. */
    link?: CommunityInviteLinkRow | null;
  },
): Promise<JoinViaInviteLinkResult> {
  const row = options?.link ?? (await getInviteLinkByToken(token));
  if (!row || isInviteLinkExpired(row)) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const cid = row.community_id.trim();
  const uid = userId.trim();
  const admin = createSupabaseAdminClient();

  const { data: c, error: cErr } = await admin
    .from("communities")
    .select("id, is_private")
    .eq("id", cid)
    .maybeSingle();
  if (cErr || !c) return { ok: false, reason: "not_found" };

  const { data: existing } = await admin
    .from("community_members")
    .select("id")
    .eq("community_id", cid)
    .eq("user_id", uid)
    .maybeSingle();
  if (existing) {
    await markPendingDirectInviteAcceptedForMember(cid, uid);
    return { ok: true, communityId: cid, alreadyMember: true };
  }

  const { error: insErr } = await admin.from("community_members").insert({
    community_id: cid,
    user_id: uid,
    role: "member",
  });
  if (insErr) {
    console.error("[community] join via invite link", insErr);
    return { ok: false, reason: "error" };
  }

  await recordCommunityEvent({
    communityId: cid,
    userId: uid,
    type: "milestone",
    metadata: { kind: "joined", via: "invite_link" },
  });

  await markPendingDirectInviteAcceptedForMember(cid, uid);

  return { ok: true, communityId: cid, alreadyMember: false };
}
