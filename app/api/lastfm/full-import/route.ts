import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { enqueueLastfmFullImport } from "@/lib/jobs/lastfmQueue";

export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const supabase = await createSupabaseServerClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("lastfm_username, lastfm_import_status")
      .eq("id", me.id)
      .maybeSingle();

    if (error) return apiInternalError(error);

    const username = user?.lastfm_username?.trim();
    if (!username) return apiBadRequest("Save a Last.fm username first.");

    const status = user?.lastfm_import_status;
    if (status === "pending" || status === "running") {
      return apiConflict("An import is already in progress.");
    }

    const admin = createSupabaseAdminClient();
    const { error: updateErr } = await admin
      .from("users")
      .update({
        lastfm_import_status: "pending",
        lastfm_import_progress: {},
      })
      .eq("id", me.id);

    if (updateErr) return apiInternalError(updateErr);

    await enqueueLastfmFullImport({
      userId: me.id,
      lastfmUsername: username,
      fromIso: "1970-01-01T00:00:00.000Z",
    });

    console.log("[lastfm] full-import enqueued", { userId: me.id });

    return apiOk({ status: "pending" });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
