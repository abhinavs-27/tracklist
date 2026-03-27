import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { transferCommunityCreatorshipFromUser } from "@/lib/account/transfer-community-creatorship";

/**
 * Permanently remove the user row. Communities they created are reassigned to
 * another admin (or another member promoted on public communities) when other
 * members exist; sole-member communities are still removed via CASCADE.
 * Other dependents use ON DELETE CASCADE (logs, reviews, follows, tokens,
 * community membership, notifications, etc.). Notifications referencing this
 * user as actor become actor_user_id NULL (SET NULL).
 */
export async function deleteUserAccount(
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = userId.trim();
  if (!uid) {
    return { ok: false, message: "Invalid user" };
  }

  const admin = createSupabaseAdminClient();

  const transfer = await transferCommunityCreatorshipFromUser(admin, uid);
  if (!transfer.ok) return transfer;

  const { error } = await admin.from("users").delete().eq("id", uid);

  if (error) {
    console.error("[account] delete user", error);
    return {
      ok: false,
      message:
        error.code === "23503"
          ? "Could not delete account because some data is still linked. Contact support."
          : "Could not delete account. Please try again.",
    };
  }

  try {
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (
      authErr &&
      !String(authErr.message ?? "").toLowerCase().includes("not found") &&
      !String(authErr.message ?? "").toLowerCase().includes("user not found")
    ) {
      console.warn("[account] auth.admin.deleteUser", authErr.message);
    }
  } catch (e) {
    console.warn("[account] auth.admin.deleteUser skipped", e);
  }

  return { ok: true };
}
