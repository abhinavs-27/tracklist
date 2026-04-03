import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityRow, CommunityWithMeta } from "@/types";

import type { CommunityMemberRole } from "@/lib/community/member-role";
import {
  canEditCommunitySettings,
  canPromoteToAdmin,
} from "@/lib/community/permissions";
import { recordCommunityEvent } from "@/lib/community/record-event";
import type { CommunityMemberListRow } from "@/lib/community/member-list";
import { fetchUserMap } from "@/lib/queries";

export type { CommunityMemberRole } from "@/lib/community/member-role";

function normalizeMemberRole(raw: string | null | undefined): CommunityMemberRole | null {
  if (raw === "admin" || raw === "owner") return "admin";
  if (raw === "member") return "member";
  return null;
}

async function getUserCommunitiesLegacy(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  uid: string,
  limit = 50,
  offset = 0,
): Promise<CommunityWithMeta[]> {
  const from = offset;
  const to = offset + limit - 1;
  const { data: memberships, error } = await admin
    .from("community_members")
    // Optimization: exclude user_id as it is in the .eq filter
    .select("community_id, role")
    .eq("user_id", uid)
    .range(from, to);

  if (error || !memberships?.length) return [];

  const ids = [
    ...new Set(
      (memberships as { community_id: string }[]).map((m) => m.community_id),
    ),
  ];
  const roleByCid = new Map(
    (memberships as { community_id: string; role: string }[]).map((m) => [
      m.community_id,
      normalizeMemberRole(m.role) ?? "member",
    ]),
  );

  const { data: comms, error: cErr } = await admin
    .from("communities")
    .select("id, name, description, is_private, created_by, created_at")
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (cErr || !comms?.length) return [];

  const counts = await Promise.all(
    ids.map(async (id) => {
      const { count } = await admin
        .from("community_members")
        // Optimization: use head: true for pure count
        .select("id", { count: "exact", head: true })
        .eq("community_id", id);
      return [id, count ?? 0] as const;
    }),
  );
  const countMap = new Map(counts);

  return (comms as CommunityRow[]).map((c) => ({
    ...c,
    member_count: countMap.get(c.id) ?? 0,
    my_role: (roleByCid.get(c.id) ?? "member") as CommunityMemberRole,
  }));
}

export async function getUserCommunities(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<CommunityWithMeta[]> {
  const admin = createSupabaseAdminClient();
  const uid = userId?.trim();
  if (!uid) return [];

  const { data, error } = await admin.rpc("get_user_communities_with_meta", {
    p_user_id: uid,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && Array.isArray(data)) {
    return (data as Record<string, unknown>[]).map((row) => {
      const roleRaw = String(row.my_role ?? "member");
      const my_role: CommunityMemberRole =
        normalizeMemberRole(roleRaw) ?? "member";
      return {
        id: String(row.id),
        name: String(row.name),
        description:
          row.description === null || row.description === undefined
            ? null
            : String(row.description),
        is_private: Boolean(row.is_private),
        created_by: String(row.created_by),
        created_at: String(row.created_at),
        member_count: Math.max(0, Number(row.member_count) || 0),
        my_role,
      };
    });
  }

  if (error) {
    console.warn(
      "[community] get_user_communities_with_meta RPC failed, using fallback:",
      error.message,
    );
  }

  return getUserCommunitiesLegacy(admin, uid, limit, offset);
}

export async function getCommunityById(
  communityId: string,
): Promise<CommunityRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("communities")
    .select("id, name, description, is_private, created_by, created_at")
    .eq("id", communityId.trim())
    .maybeSingle();
  if (error || !data) return null;
  return data as CommunityRow;
}

export async function getCommunityMemberCount(
  communityId: string,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("community_members")
    // Optimization: use head: true for pure count
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId.trim());
  if (error) return 0;
  return count ?? 0;
}

export async function isCommunityMember(
  communityId: string,
  userId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_members")
    // Optimization: exclude community_id, user_id as they are in the .eq filters
    .select("id")
    .eq("community_id", communityId.trim())
    .eq("user_id", userId.trim())
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function getCommunityMemberRole(
  communityId: string,
  userId: string,
): Promise<CommunityMemberRole | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_members")
    // Optimization: exclude community_id, user_id as they are in the .eq filters
    .select("role")
    .eq("community_id", communityId.trim())
    .eq("user_id", userId.trim())
    .maybeSingle();
  if (error || !data) return null;
  const r = (data as { role: string }).role;
  return normalizeMemberRole(r);
}

export async function createCommunity(
  userId: string,
  input: {
    name: string;
    description?: string | null;
    is_private: boolean;
  },
): Promise<CommunityRow | null> {
  const admin = createSupabaseAdminClient();
  const name = input.name?.trim();
  if (!name || name.length < 2) return null;

  const { data: row, error } = await admin
    .from("communities")
    .insert({
      name,
      description: input.description?.trim() || null,
      is_private: !!input.is_private,
      created_by: userId,
    })
    .select("id, name, description, is_private, created_by, created_at")
    .single();

  if (error || !row) {
    console.error("[community] create failed", error);
    return null;
  }

  const c = row as CommunityRow;
  let mErr = (
    await admin.from("community_members").insert({
      community_id: c.id,
      user_id: userId,
      role: "admin",
    })
  ).error;

  /** DBs that never ran migration 076 still only allow `owner` | `member`. */
  if (
    mErr &&
    (mErr as { code?: string }).code === "23514" &&
    String(mErr.message ?? "").includes("community_members_role_check")
  ) {
    mErr = (
      await admin.from("community_members").insert({
        community_id: c.id,
        user_id: userId,
        role: "owner",
      })
    ).error;
  }

  if (mErr) {
    console.error("[community] creator membership failed", mErr);
    await admin.from("communities").delete().eq("id", c.id);
    return null;
  }

  await recordCommunityEvent({
    communityId: c.id,
    userId,
    type: "milestone",
    metadata: { kind: "created" },
  });

  return c;
}

/** Join a public community. Returns false if private, full, or already member. */
export async function joinPublicCommunity(
  communityId: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  const uid = userId.trim();

  const { data: c, error: cErr } = await admin
    .from("communities")
    // Optimization: exclude id as it is in the .eq filter
    .select("is_private")
    .eq("id", cid)
    .maybeSingle();
  if (cErr || !c) return { ok: false, reason: "not_found" };
  if ((c as { is_private: boolean }).is_private) {
    return { ok: false, reason: "private" };
  }

  const { data: existing } = await admin
    .from("community_members")
    // Optimization: exclude community_id, user_id as they are in the .eq filters
    .select("id")
    .eq("community_id", cid)
    .eq("user_id", uid)
    .maybeSingle();
  if (existing) return { ok: true };

  const { error: jErr } = await admin.from("community_members").insert({
    community_id: cid,
    user_id: uid,
    role: "member",
  });
  if (jErr) {
    console.error("[community] join failed", jErr);
    return { ok: false, reason: "error" };
  }

  await recordCommunityEvent({
    communityId: cid,
    userId: uid,
    type: "milestone",
    metadata: { kind: "joined" },
  });

  return { ok: true };
}

export type { CommunityMemberListRow } from "@/lib/community/member-list";

export async function listCommunityMembersForSettings(
  communityId: string,
): Promise<CommunityMemberListRow[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  if (!cid) return [];

  const { data: rows, error } = await admin
    .from("community_members")
    // Optimization: exclude community_id as it is in the .eq filter
    .select("user_id, role, created_at")
    .eq("community_id", cid)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return [];

  const userIds = (rows as { user_id: string }[]).map((r) => r.user_id);
  const userMap = await fetchUserMap(admin, userIds);

  return (rows as { user_id: string; role: string }[]).map((r) => {
    const u = userMap.get(r.user_id);
    return {
      user_id: r.user_id,
      username: u?.username ?? "Unknown",
      avatar_url: u?.avatar_url ?? null,
      role: normalizeMemberRole(r.role) ?? "member",
    };
  });
}

async function setAllCommunityMembersAdmin(communityId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("community_members")
    .update({ role: "admin" })
    .eq("community_id", communityId.trim());
  if (error) {
    console.error("[community] set all members admin", error);
    return false;
  }
  return true;
}

export async function updateCommunitySettings(
  communityId: string,
  actorUserId: string,
  patch: {
    name?: string;
    description?: string | null;
    is_private?: boolean;
  },
): Promise<
  | { ok: true; community: CommunityRow }
  | { ok: false; reason: "not_found" | "forbidden" | "validation" | "error" }
> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  const actor = actorUserId.trim();
  if (!cid || !actor) return { ok: false, reason: "validation" };

  const community = await getCommunityById(cid);
  if (!community) return { ok: false, reason: "not_found" };

  const isMember = await isCommunityMember(cid, actor);
  const role = await getCommunityMemberRole(cid, actor);
  if (!canEditCommunitySettings(community.is_private, isMember, role)) {
    return { ok: false, reason: "forbidden" };
  }

  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 2 || n.length > 120) {
      return { ok: false, reason: "validation" };
    }
    updates.name = n;
  }
  if (patch.description !== undefined) {
    const d =
      patch.description === null || patch.description === ""
        ? null
        : String(patch.description).trim();
    if (d !== null && d.length > 2000) {
      return { ok: false, reason: "validation" };
    }
    updates.description = d;
  }

  let becamePrivate = false;
  if (patch.is_private !== undefined) {
    const next = Boolean(patch.is_private);
    if (next && !community.is_private) {
      becamePrivate = true;
    }
    updates.is_private = next;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, reason: "validation" };
  }

  const { data: row, error } = await admin
    .from("communities")
    .update(updates)
    .eq("id", cid)
    .select("id, name, description, is_private, created_by, created_at")
    .single();

  if (error || !row) {
    console.error("[community] update settings", error);
    return { ok: false, reason: "error" };
  }

  if (becamePrivate) {
    const ok = await setAllCommunityMembersAdmin(cid);
    if (!ok) return { ok: false, reason: "error" };
  }

  return { ok: true, community: row as CommunityRow };
}

export async function promoteCommunityMemberToAdmin(
  communityId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  const actor = actorUserId.trim();
  const target = targetUserId.trim();
  if (!cid || !actor || !target) return { ok: false, reason: "invalid" };
  if (actor === target) return { ok: false, reason: "self" };

  const community = await getCommunityById(cid);
  if (!community) return { ok: false, reason: "not_found" };

  const actorRole = await getCommunityMemberRole(cid, actor);
  const targetRole = await getCommunityMemberRole(cid, target);
  if (actorRole === null || targetRole === null) {
    return { ok: false, reason: "forbidden" };
  }

  if (!canPromoteToAdmin(community.is_private, true, actorRole)) {
    return { ok: false, reason: "forbidden" };
  }

  if (targetRole === "admin") return { ok: true };

  const { error } = await admin
    .from("community_members")
    .update({ role: "admin" })
    .eq("community_id", cid)
    .eq("user_id", target);

  if (error) {
    console.error("[community] promote", error);
    return { ok: false, reason: "error" };
  }

  return { ok: true };
}
