import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiOk } from "@/lib/api-response";
import { syncFeedEventsForUser } from "@/lib/feed/generate-events";

const MAX_USERS = 80;

/**
 * Materialize feed_events for users with recent listens (batch).
 * GET /api/cron/feed-events-sync
 */
export async function GET() {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("logs")
    .select("user_id")
    .gte("listened_at", since)
    .limit(2000);

  if (error) {
    console.error("[cron feed-events-sync] logs query failed", error);
    return apiOk({ ok: false, processed: 0, error: error.message });
  }

  const seen = new Set<string>();
  const userIds: string[] = [];
  for (const r of rows ?? []) {
    const id = (r as { user_id: string }).user_id;
    if (id && !seen.has(id)) {
      seen.add(id);
      userIds.push(id);
      if (userIds.length >= MAX_USERS) break;
    }
  }

  let ok = 0;
  for (const uid of userIds) {
    try {
      await syncFeedEventsForUser(uid);
      ok += 1;
    } catch (e) {
      console.warn("[cron feed-events-sync] sync failed", uid, e);
    }
  }

  return apiOk({ ok: true, attempted: userIds.length, processed: ok });
}
