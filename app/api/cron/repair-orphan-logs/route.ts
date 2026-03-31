import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, apiOk } from "@/lib/api-response";

const LOG = "[cron repair-orphan-logs]";

function rpcErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Repoints logs whose track_id no longer exists (see migration 112).
 * Intentionally unauthenticated — for local / trusted use only.
 *
 * GET /api/cron/repair-orphan-logs
 */
export async function GET() {
  const started = Date.now();
  console.log(LOG, "start");
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("repair_orphan_logs_track_ids");
    if (error) throw error;
    const totalMs = Date.now() - started;
    console.log(LOG, "done", { totalMs, rows: (data as unknown[])?.length ?? 0 });
    return apiOk({ ok: true, totalMs, rows: data ?? [] });
  } catch (e) {
    console.error(LOG, "failed", e);
    return apiError(rpcErrorMessage(e), 500);
  }
}
