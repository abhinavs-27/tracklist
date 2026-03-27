import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "owner";
}

type MemberRow = { user_id: string; role: string };

function pickSuccessor(members: MemberRow[], leavingUserId: string): MemberRow | null {
  const others = members.filter((m) => m.user_id !== leavingUserId);
  if (others.length === 0) return null;
  others.sort((a, b) => {
    const aa = isAdminRole(a.role) ? 0 : 1;
    const bb = isAdminRole(b.role) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return a.user_id.localeCompare(b.user_id);
  });
  return others[0] ?? null;
}

async function promoteToAdmin(
  admin: Admin,
  communityId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let { error } = await admin
    .from("community_members")
    .update({ role: "admin" })
    .eq("community_id", communityId)
    .eq("user_id", userId);

  if (
    error &&
    (error as { code?: string }).code === "23514" &&
    String(error.message ?? "").includes("community_members_role_check")
  ) {
    ({ error } = await admin
      .from("community_members")
      .update({ role: "owner" })
      .eq("community_id", communityId)
      .eq("user_id", userId));
  }

  if (error) {
    console.error("[account] promote successor to admin", error);
    return { ok: false, message: "Could not reassign community ownership" };
  }
  return { ok: true };
}

/**
 * For each community the user created that still has other members, set
 * `created_by` to another admin when possible, otherwise another member (promoted
 * to admin on public communities). Communities where they are the only member
 * are left unchanged so `users` delete still CASCADE-removes those rows.
 */
export async function transferCommunityCreatorshipFromUser(
  admin: Admin,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, message: "Invalid user" };

  const { data: owned, error: listErr } = await admin
    .from("communities")
    .select("id, is_private")
    .eq("created_by", uid);

  if (listErr) {
    console.error("[account] list owned communities", listErr);
    return { ok: false, message: "Could not prepare account deletion" };
  }

  const rows = (owned ?? []) as { id: string; is_private: boolean }[];
  for (const comm of rows) {
    const { data: memberRows, error: mErr } = await admin
      .from("community_members")
      .select("user_id, role")
      .eq("community_id", comm.id);

    if (mErr) {
      console.error("[account] list community members", mErr);
      return { ok: false, message: "Could not prepare account deletion" };
    }

    const members = (memberRows ?? []) as MemberRow[];
    const successor = pickSuccessor(members, uid);
    if (!successor) continue;

    if (!comm.is_private && !isAdminRole(successor.role)) {
      const p = await promoteToAdmin(admin, comm.id, successor.user_id);
      if (!p.ok) return p;
    }

    const { error: upErr } = await admin
      .from("communities")
      .update({ created_by: successor.user_id })
      .eq("id", comm.id);

    if (upErr) {
      console.error("[account] transfer community created_by", upErr);
      return { ok: false, message: "Could not reassign community ownership" };
    }
  }

  return { ok: true };
}
