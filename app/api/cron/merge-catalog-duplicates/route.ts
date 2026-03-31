import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, apiOk } from "@/lib/api-response";
import { runMergeCatalogDuplicates } from "@/lib/cron/merge-catalog-duplicates";

const LOG = "[cron merge-catalog-duplicates]";

/**
 * Dedupe canonical catalog rows (tracks → albums → artists per round, one RPC per pair).
 * Intentionally unauthenticated — for local / trusted use only. Do not expose production
 * without protecting this URL (edge auth, VPN, or remove the route).
 *
 * GET /api/cron/merge-catalog-duplicates?maxRounds=5
 * GET /api/cron/merge-catalog-duplicates?dryRun=1
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const maxRoundsRaw = url.searchParams.get("maxRounds");
  const maxRounds = maxRoundsRaw
    ? Math.min(200, Math.max(1, parseInt(maxRoundsRaw, 10) || 5))
    : 5;
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";

  const started = Date.now();
  console.log(LOG, "start", { maxRounds, dryRun });

  try {
    const supabase = createSupabaseAdminClient();
    const result = await runMergeCatalogDuplicates(supabase, {
      maxRounds,
      dryRun,
    });
    const totalMs = Date.now() - started;
    console.log(LOG, "done", {
      totalMs,
      rounds: result.rounds.length,
      listRpcErrors: result.listRpcErrors.length,
    });
    return apiOk({ ok: true, totalMs, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(LOG, "failed", message);
    return apiError(message, 500);
  }
}
