import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

const DEFAULTS = {
  social: true,
  recommendations: true,
  community: true,
  charts: false,
} as const;

type PrefKey = keyof typeof DEFAULTS;
const KEYS: PrefKey[] = ["social", "recommendations", "community", "charts"];

/** GET /api/users/me/notification-preferences — effective notification prefs (defaults when unset). Auth required. */
export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("notification_preferences")
      .select("social, recommendations, community, charts")
      .eq("user_id", me.id)
      .maybeSingle();
    const row = (data as Record<PrefKey, boolean> | null) ?? null;
    return apiOk(
      Object.fromEntries(
        KEYS.map((k) => [k, row ? row[k] : DEFAULTS[k]]),
      ) as Record<PrefKey, boolean>,
    );
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

/** PATCH /api/users/me/notification-preferences — upsert a partial subset of prefs. Auth required. */
export async function PATCH(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { data: body, error: parseErr } =
      await parseBody<Partial<Record<PrefKey, unknown>>>(request);
    if (parseErr) return parseErr;

    const patch: Partial<Record<PrefKey, boolean>> = {};
    for (const k of KEYS) {
      if (k in (body ?? {})) {
        if (typeof body![k] !== "boolean") {
          return apiBadRequest(`${k} must be a boolean`);
        }
        patch[k] = body![k] as boolean;
      }
    }
    if (Object.keys(patch).length === 0) {
      return apiBadRequest("no preference fields provided");
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("notification_preferences").upsert(
      { user_id: me.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return apiInternalError(error);
    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
