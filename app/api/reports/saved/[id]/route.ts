import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import {
  apiBadRequest,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isValidUuid } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

/** DELETE /api/reports/saved/[id] — remove a saved listening report (owner only). */
export async function DELETE(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const me = await requireApiAuth(request);
    const { id } = await ctx.params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid report id");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_reports")
      .delete()
      .eq("id", id)
      .eq("user_id", me.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[api/reports/saved/[id]] delete", error);
      return apiInternalError(error);
    }
    if (!data) {
      return apiNotFound("Report not found");
    }
    return apiOk({ ok: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
