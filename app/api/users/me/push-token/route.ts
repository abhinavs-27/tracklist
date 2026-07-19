import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

const MAX_TOKEN_LEN = 512;

/** POST /api/users/me/push-token — register/refresh an Expo token. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { data: body, error: parseErr } = await parseBody<{
      expo_push_token?: unknown;
      platform?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw = body?.expo_push_token;
    if (typeof raw !== "string" || raw.trim() === "") {
      return apiBadRequest("expo_push_token must be a non-empty string");
    }
    const token = raw.trim().slice(0, MAX_TOKEN_LEN);
    const platform =
      body?.platform === "ios" || body?.platform === "android"
        ? body.platform
        : null;

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("push_tokens").upsert(
      { user_id: me.id, token, platform, last_seen_at: new Date().toISOString() },
      { onConflict: "token" },
    );
    if (error) return apiInternalError(error);

    console.log("[users] push-token-registered", { userId: me.id, platform });
    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

/** DELETE /api/users/me/push-token — remove a token (logout). Auth required. */
export async function DELETE(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { data: body, error: parseErr } = await parseBody<{
      expo_push_token?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw = body?.expo_push_token;
    if (typeof raw !== "string" || raw.trim() === "") {
      return apiBadRequest("expo_push_token must be a non-empty string");
    }
    const token = raw.trim().slice(0, MAX_TOKEN_LEN);

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("push_tokens")
      .delete()
      .eq("user_id", me.id)
      .eq("token", token);
    if (error) return apiInternalError(error);

    console.log("[users] push-token-removed", { userId: me.id });
    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
