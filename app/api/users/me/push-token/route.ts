import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { PushTokenUpdateBody } from "@/types";

const MAX_TOKEN_LEN = 512;

/** POST /api/users/me/push-token — register or clear Expo push token. Auth required. */
export const POST = withHandler(async (request: NextRequest, { user: me }) => {
  const { data: body, error: parseErr } = await parseBody<PushTokenUpdateBody>(request);
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
    .eq("id", me!.id);

  if (error) return apiInternalError(error);

  console.log("[users] push-token-updated", {
    userId: me!.id,
    action: token ? "set" : "clear",
  });

  return apiOk({ ok: true });
}, { requireAuth: true });
