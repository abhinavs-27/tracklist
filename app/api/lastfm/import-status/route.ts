import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { apiInternalError, apiOk } from "@/lib/api-response";

const STALL_THRESHOLD_MS = 30 * 60 * 1000;

export type LastfmImportStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "stalled"
  | null;

export type LastfmImportProgress = {
  pagesDone?: number;
  pagesTotal?: number | null;
  logsAdded?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("lastfm_import_status, lastfm_import_progress")
      .eq("id", me.id)
      .maybeSingle();

    if (error) return apiInternalError(error);

    const rawStatus = data?.lastfm_import_status as string | null;
    const progress = (data?.lastfm_import_progress as LastfmImportProgress | null) ?? {};

    let status: LastfmImportStatus = rawStatus as LastfmImportStatus;
    if (rawStatus === "running" && progress.startedAt) {
      const elapsed = Date.now() - new Date(progress.startedAt).getTime();
      if (elapsed > STALL_THRESHOLD_MS) status = "stalled";
    }

    return apiOk({ data: { status, progress } });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
