import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiOk } from "@/lib/api-response";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";

/**
 * Prefer users who have logs but no cache row yet, then oldest cache rows (rotation).
 */
const MAX_USERS_PER_RUN = 35;

async function resolveCronUserIds(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();
  const out: string[] = [];

  const { data: needRows, error: needErr } = await admin.rpc(
    "user_ids_without_taste_identity_cache",
    { p_limit: MAX_USERS_PER_RUN },
  );

  if (needErr) {
    console.warn(
      "[cron taste-identity] user_ids_without_taste_identity_cache RPC failed (apply migration 063?)",
      needErr,
    );
  } else {
    for (const row of needRows ?? []) {
      const id = (row as { user_id: string }).user_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  if (out.length < MAX_USERS_PER_RUN) {
    const { data: staleRows, error: staleErr } = await admin
      .from("taste_identity_cache")
      .select("user_id")
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(MAX_USERS_PER_RUN);

    if (staleErr) {
      console.error("[cron taste-identity] taste_identity_cache query failed", staleErr);
    } else {
      for (const r of staleRows ?? []) {
        const id = r.user_id as string;
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
        if (out.length >= MAX_USERS_PER_RUN) break;
      }
    }
  }

  return out.slice(0, MAX_USERS_PER_RUN);
}

/**
 * Daily taste identity refresh — recomputes `taste_identity_cache` from logs
 * (listening style, top artists, summary, artwork hydration, etc.).
 * Profile pages only read the cache (fast).
 *
 * GET /api/cron/taste-identity-refresh
 * Optional: Authorization: Bearer CRON_SECRET (when enabled in route)
 */
export async function GET() {
  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return apiUnauthorized();
  // }

  const userIds = await resolveCronUserIds();
  let processed = 0;
  let failures = 0;

  for (const userId of userIds) {
    try {
      await refreshTasteIdentityCacheForUser(userId);
      processed += 1;
    } catch (e) {
      console.error("[cron taste-identity] refresh failed", userId, e);
      failures += 1;
    }
  }

  console.log("[cron] taste-identity-refresh-complete", {
    success: true,
    attempted: userIds.length,
    processed,
    failures,
  });

  return apiOk({
    ok: true,
    attempted: userIds.length,
    processed,
    failures,
  });
}

