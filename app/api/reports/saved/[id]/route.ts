import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isValidUuid } from "@/lib/validation";

/** DELETE /api/reports/saved/[id] — remove a saved listening report (owner only). */
export const DELETE = withHandler(async (request: NextRequest, { params, user: me }) => {
  const { id } = params;
  if (!isValidUuid(id)) return apiBadRequest("Invalid report id");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("user_id", me!.id)
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
}, { requireAuth: true });
