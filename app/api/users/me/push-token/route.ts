import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

const MAX_TOKEN_LEN = 512;

/** POST /api/users/me/push-token — register or clear Expo push token. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { data: body, error: parseErr } = await parseBody<{
      expo_push_token?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    if (body == null || !("expo_push_token" in body)) {
      return apiBadRequest("expo_push_token is required");
    }

    const raw = body.expo_push_token;
    if (raw !== null && typeof raw !== "string") {
      return apiBadRequest("expo_push_token must be a string or null");
    }
    const token =
      raw === null
        ? null
        : String(raw).trim().slice(0, MAX_TOKEN_LEN);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("users")
      .update({ expo_push_token: token || null })
      .eq("id", me.id);

    if (error) return apiInternalError(error);

    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
