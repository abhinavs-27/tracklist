import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { CommunityRow, CommunityWithMeta } from "@/types";

import { recordCommunityEvent } from "@/lib/community/record-event";

export async function getUserCommunities(
  userId: string,
): Promise<CommunityWithMeta[]> {
  const admin = createSupabaseAdminClient();
  const uid = userId?.trim();
  if (!uid) return [];

  const { data: memberships, error } = await admin
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", uid);

  if (error || !memberships?.length) return [];

  const ids = [
    ...new Set(
      (memberships as { community_id: string }[]).map((m) => m.community_id),
    ),
  ];
  const roleByCid = new Map(
    (memberships as { community_id: string; role: string }[]).map((m) => [
      m.community_id,
      m.role,
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
        .select("id", { count: "exact", head: true })
        .eq("community_id", id);
      return [id, count ?? 0] as const;
    }),
  );
  const countMap = new Map(counts);

  return (comms as CommunityRow[]).map((c) => ({
    ...c,
    member_count: countMap.get(c.id) ?? 0,
    my_role: (roleByCid.get(c.id) ?? "member") as "owner" | "member",
  }));
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
): Promise<"owner" | "member" | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_members")
    .select("role")
    .eq("community_id", communityId.trim())
    .eq("user_id", userId.trim())
    .maybeSingle();
  if (error || !data) return null;
  const r = (data as { role: string }).role;
  if (r === "owner" || r === "member") return r;
  return null;
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
  const { error: mErr } = await admin.from("community_members").insert({
    community_id: c.id,
    user_id: userId,
    role: "owner",
  });
  if (mErr) {
    console.error("[community] owner membership failed", mErr);
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
    .select("id, is_private")
    .eq("id", cid)
    .maybeSingle();
  if (cErr || !c) return { ok: false, reason: "not_found" };
  if ((c as { is_private: boolean }).is_private) {
    return { ok: false, reason: "private" };
  }

  const { data: existing } = await admin
    .from("community_members")
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
