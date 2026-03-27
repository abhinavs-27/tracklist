import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { deleteUserAccount } from "@/lib/account/delete-user-account";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUsername } from "@/lib/validation";

/**
 * POST /api/users/me/delete
 * Body: { confirmUsername: string, acknowledgePermanent: true }
 */
export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<{
      confirmUsername?: unknown;
      acknowledgePermanent?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    if (body!.acknowledgePermanent !== true) {
      return apiBadRequest("You must confirm permanent deletion");
    }

    const raw =
      typeof body!.confirmUsername === "string"
        ? body!.confirmUsername.trim()
        : "";
    if (!raw || !isValidUsername(raw)) {
      return apiBadRequest("Type your exact username to confirm");
    }

    const admin = createSupabaseAdminClient();
    const { data: row, error: fetchErr } = await admin
      .from("users")
      .select("id, username")
      .eq("id", me!.id)
      .maybeSingle();
    if (fetchErr || !row) {
      return apiInternalError(fetchErr ?? new Error("user missing"));
    }

    const dbUsername = (row as { username: string }).username;
    if (raw.toLowerCase() !== dbUsername.toLowerCase()) {
      return apiBadRequest("Username does not match — check spelling");
    }

    const result = await deleteUserAccount(me!.id);
    if (!result.ok) {
      return apiBadRequest(result.message);
    }

    return apiOk({ deleted: true });
  },
  { requireAuth: true },
);
